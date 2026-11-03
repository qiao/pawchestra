"""Gives the steps that rebuild an arm that the mesh joins to the trunk down to the elbow.

The upper arm of such a mesh joins the side of the trunk, so a cut at a right angle to the
bone finds no closed loop around the arm. These steps give the arm a real armpit, and
`fox_arms.py` and `deer_arms.py` run them with the settings of their animal (`STEPS`):

1. Import the mesh and Merge by Distance (`violin_arms.import_mesh()`).
2. Cut each arm along the seam where it meets the trunk, not at a right angle to the bone: Bisect
   with the plane of the seam (`seam_plane()`) above the source armpit, and Bisect at the wrist. The
   faces of the arm beyond the seam and the wrist go (Delete Faces).
3. Split the hole of the seam at the height `seam.edge` into the top arc (the shoulder) and the
   lower run. A new edge run across the plane, the armpit line, closes the lower run, and Fill
   (Beauty) makes the side wall of the trunk under the arm from them.
4. Model a quad tube of rings of `RING_VERTS` from the shoulder to the wrist. Each ring stands at a
   right angle to its bone. Where a ring of the upper arm goes into the trunk, its vertices lie on
   the plane of the seam: the flat inner side of the upper arm lies on the side wall, and the two
   meet only at the armpit line. Shrinkwrap puts the other vertices on the source arm.
5. Bridge Edge Loops joins the first ring to the top arc and the armpit line, and the last ring to
   the paw. Beautify Faces runs on the bridge triangles.
6. UV, bake, normals, the shape of the app body, the atlas, and the export, as in
   `violin_arms.py`. Smooth Vertices rounds the two edges of the flat inner side. The inner side
   and the side wall take the fur color of the trunk beside the seam. Before the atlas, the
   trunk moves to an even oval from the front and from the side (`step_belly()`). Then the side
   wall gets vertices inside it and rounds into the trunk, with no lips at its lower tip
   (`step_round_wall()`), and
   the band between each armpit line and the flat inner side of the arm gets new triangles with
   no thin face (`step_clean_pit()`).
7. The studio skeleton with the arm segments and the helpers, automatic weights, and the Weight
   Paint fixes of `step_paint()`.
8. Write the weights for `paintedWeights` of the config (`<animal>-weights.json`).

The script has no run of its own. `look()` also writes the check images of
`arm_rebuild.py`.
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import violin_arms as va  # noqa: E402

#: The keys of the settings of an animal of these steps, in the units of the studio (1 unit
#: from the soles to the top), as `fox_arms.py` and `deer_arms.py` give them. `seam`: the cut
#: along the seam and the armpit:
#:
#: - `x`, `lean`: the plane of the seam, |x| from the middle plane at the height `armpit`, and its
#:   lean out for each unit of height down, as the side of the trunk widens below the armpit.
#: - `low`: the lowest height of the cut, below the source armpit. `reach`: the distance from the
#:   forearm line of a face of the free arm below `low`. `under` (optional): a face below `low`
#:   is also out from |x| `under.x` plus `under.lean` for each unit of height below `low`, so that
#:   a round belly under a thick forearm stays on the trunk (the hippo). `hole` (optional): the
#:   reach of the hole of the seam from the upper arm line, 0.16 by default.
#: - `edge`, `armpit`: the heights of the ends and of the middle of the armpit line. Equal heights
#:   give a straight line.
#: - `lift`: the place of the flat inner side of the arm from the side wall: a small depth in the
#:   trunk, so that the front and the back of the arm root stay against the trunk with no slit.
#: - `rings`: the blend shares of the rings of the shoulder from the socket to the first ring.
#:   `ruled`: the number of those rings that keep the rule weights of the config. `ramp`: the
#:   number of rounds of Smooth on the weights of the tube. `round`: the rounds of Smooth Vertices
#:   on the edges of the flat side. `wrap`: the limit of the Shrinkwrap.
#:
#: `anchor`: the share of the chest on the tube near the side walls (`anchor()`).
#:
#: `belly`: the even oval of the trunk (`step_belly()`), in shares `f` of the line from the hips
#: joint to the neck joint of the config. `front`: the two ends of the ellipse arc of the belly
#: front in the side view. `sides`: the two ends of the even curve of each side in the front view,
#: and `bend` the weight of its bends. `step`: the distance of the cuts along the line, in units.
#: `round`: the share of the move of the belly front toward the half ellipse of its cut, and the
#: shares of the half width where the move starts and ends its fade to the sides. `flat`
#: (optional): the shares `f` of the line, the angles from the front, and the largest move in
#: units of the flatter front of the upper belly.
#:
#: `wall` (optional): the round side wall (`step_round_wall()`). `lip`, `depth`, and `over`: a
#: trunk face at the lower run of the flat wall is a lip when the dot product of its normal with
#: the normal of the plane of the seam is at most `lip`, it lies within `depth` units of the
#: plane, and at most `over` units over the armpit line. `grid`: the side of the triangles of the
#: new wall in units. `rings` and `reach`: the rings of trunk vertices around the wall that move,
#: within `reach` units of a vertex of the wall. `rounds`: the rounds of Smooth Vertices. `deep`:
#: the largest depth of a vertex of the wall in the trunk.
#:
#: `pit` (optional): the clean of the band between each armpit line and the flat inner side of
#: the arm (`step_clean_pit()`). `near`: for the first and the second shoulder ring, the distance
#: in units under which a vertex below the line merges into the next ring. `close`: the distance
#: under which a vertex above the line, at its back half, merges into the line. `weld`: the
#: distance under which a socket vertex merges into an end of the line or into its neighbor on the
#: socket. `sides`: the sides of the clean, `L` and `R` (the left and the right arm of the animal).
#:
#: The other keys are the keys of `violin_arms.ANIMALS`.

RING_VERTS = va.RING_VERTS
PART = dict(va.PART, wall=4, armpit=5)

VIEWS = None


def look(s, name, objects=None, center=(0.15, 0.53, 0.05), scale=0.3,
         views=(('front', 0, 0), ('side', 90, 0), ('back', 180, 0), ('under', 60, -45),
                ('f35', 35, 10), ('b35', 145, 10))):
    """Renders check views of the left arm with the edges, when `--views` names a folder."""
    if VIEWS is None:
        return
    scene = bpy.context.scene
    engine = scene.render.engine
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'TEXTURE'
    scene.display.shading.show_backface_culling = False
    scene.render.resolution_x = scene.render.resolution_y = 700
    objects = objects or [s.mesh]
    hidden = [o for o in scene.objects if o.type == 'MESH' and o not in objects
              and not o.hide_render]
    for o in hidden:
        o.hide_render = True
    mat = bpy.data.materials.get('look-wire')
    if mat is None:
        black = bpy.data.images.new('look-black', 4, 4)
        black.pixels = [0.04, 0.04, 0.04, 1.0] * 16
        mat = bpy.data.materials.new('look-wire')
        mat.use_nodes = True
        tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = black
        mat.node_tree.nodes.active = tex
    wires = []
    for o in objects:
        w = o.copy()
        w.data = o.data.copy()
        w.data.materials.clear()
        w.data.materials.append(mat)
        for m in list(w.modifiers):
            w.modifiers.remove(m)
        mod = w.modifiers.new('wire', 'WIREFRAME')
        mod.thickness = s.units(0.0006)
        mod.use_replace = True
        scene.collection.objects.link(w)
        w.hide_render = False
        wires.append(w)
    cam = bpy.data.objects.get('look-cam') or bpy.data.objects.new(
        'look-cam', bpy.data.cameras.new('look-cam'))
    if cam.name not in scene.collection.objects:
        scene.collection.objects.link(cam)
    scene.camera = cam
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = s.units(scale)
    cam.data.clip_end = 100
    target = s.fr.point(center)
    for view, az, el in views:
        a, e = math.radians(az), math.radians(el)
        d = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
        cam.location = target + d * 5
        cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(VIEWS, f'{name}-{view}.png')
        bpy.ops.render.render(write_still=True)
    for w in wires:
        bpy.data.objects.remove(w, do_unlink=True)
    for o in hidden:
        o.hide_render = False
    scene.render.engine = engine


def seam_plane(s, side):
    """Gives the plane of the seam of one side in Blender (a point and the unit normal toward the
    arm). It passes through |x| = `seam.x` at the height `seam.armpit`, and leans out by `seam.lean`
    units of x for each unit of height down, as the side of the trunk widens below the armpit."""
    seam = s.spec['seam']
    point = s.fr.point((seam['x'], seam['armpit'], 0.0), side)
    return point, Vector((side, 0.0, seam['lean'])).normalized()


def step_cut(s):
    """Keeps a hidden copy of the source, and cuts each arm along the seam and at the wrist.

    The seam cut is a Bisect with the plane |x| = `seam.x` on the faces above `seam.low` near the
    upper arm. The wrist cut is the Bisect of `violin_arms.cut_arm()`. The faces of the arm are the
    faces that the free forearm reaches with no step over a cut edge, beyond the plane of the seam
    above `seam.low`, and near the forearm line below it. A copy of these faces stays as the target
    of the Shrinkwrap (`<cat>-arm`), and the faces go.
    """
    mesh = s.mesh
    source = mesh.copy()
    source.data = mesh.data.copy()
    source.name = source.data.name = s.animal + '-source'
    bpy.context.scene.collection.objects.link(source)
    source.hide_render = True
    s.source = source
    seam = s.spec['seam']
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(mesh.data)
    part = bm.verts.layers.int.get('arm_part') or bm.verts.layers.int.new('arm_part')
    bm.verts.layers.int.get('arm_spoke') or bm.verts.layers.int.new('arm_spoke')
    zone = bm.faces.layers.int.get('arm_zone') or bm.faces.layers.int.new('arm_zone')
    out = {}
    for side in (1, -1):
        off = 0 if side > 0 else 10
        line = va.arm_line(s, side)
        a, e, w, t = line
        # The wrist cut.
        point, normal = va.cut_planes(s, line, side)[1]
        faces, _ = va.ring_faces(s, bm, line, side, point, normal)
        edges = {x for f in faces for x in f.edges}
        verts = {p for f in faces for p in f.verts}
        res = bmesh.ops.bisect_plane(bm, geom=list(verts) + list(edges) + faces, plane_co=point,
                                     plane_no=normal, dist=1e-6)
        wrist = {x for x in res['geom_cut'] if isinstance(x, bmesh.types.BMEdge)}
        for x in wrist:
            for p in x.verts:
                p[part] = PART['wrist'] + off
        # The seam cut.
        plane_co, plane_no = seam_plane(s, side)
        low = s.fr.floor + s.units(seam['low'])
        reach = s.units(0.14)
        near = [f for f in bm.faces if f.calc_center_median().z > low
                and va.seg_distance(f.calc_center_median(), a, e) < reach
                and min((p.co - plane_co).dot(plane_no) for p in f.verts) < 0
                < max((p.co - plane_co).dot(plane_no) for p in f.verts)]
        edges = {x for f in near for x in f.edges}
        verts = {p for f in near for p in f.verts}
        res = bmesh.ops.bisect_plane(bm, geom=list(verts) + list(edges) + near,
                                     plane_co=plane_co, plane_no=plane_no, dist=1e-6)
        seam_edges = {x for x in res['geom_cut'] if isinstance(x, bmesh.types.BMEdge)}
        # The faces of the arm.
        fore = s.units(seam['reach'])
        under = seam.get('under')

        def inside(f):
            c = f.calc_center_median()
            if (c - plane_co).dot(plane_no) <= 0:
                return False
            if c.z > low:
                return va.seg_distance(c, a, e) < reach or va.seg_distance(c, e, w) < fore
            if under:
                depth = seam['low'] - (c.z - s.fr.floor) / s.fr.height
                if c.x * side < s.units(under['x'] + under['lean'] * depth):
                    return False
            return va.seg_distance(c, e, w) < fore or va.seg_distance(c, w, t) < fore
        mid = e.lerp(w, 0.5)
        seed = min(bm.faces, key=lambda f: (f.calc_center_median() - mid).length)
        arm, stack = set(), [seed]
        stop = wrist | seam_edges
        while stack:
            f = stack.pop()
            if f in arm or not inside(f):
                continue
            arm.add(f)
            stack += [g for x in f.edges if x not in stop for g in x.link_faces]
        if len(arm) > s.spec['faces']:
            raise RuntimeError('The arm faces reach too far: %d faces.' % len(arm))
        for f in bm.faces:
            if f in arm:
                f[zone] = 1 if side > 0 else 2
        out[side] = len(arm)
    bmesh.update_edit_mesh(mesh.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    # The copy of the arm faces, the target of the Shrinkwrap and of the bake.
    target = mesh.copy()
    target.data = mesh.data.copy()
    target.name = target.data.name = s.animal + '-arm'
    bpy.context.scene.collection.objects.link(target)
    bm = bmesh.new()
    bm.from_mesh(target.data)
    zone_t = bm.faces.layers.int['arm_zone']
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f[zone_t] == 0], context='FACES')
    bm.to_mesh(target.data)
    bm.free()
    target.hide_render = True
    s.arm = target
    look(s, '1-arm-faces', [target])
    # Delete Faces.
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(mesh.data)
    zone = bm.faces.layers.int['arm_zone']
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f[zone] > 0], context='FACES')
    bmesh.update_edit_mesh(mesh.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    look(s, '2-cut', [mesh])
    return out


def walk(edges):
    """Orders the vertices of a closed loop of edges."""
    links = {}
    for x in edges:
        a, b = x.verts
        links.setdefault(a, []).append(b)
        links.setdefault(b, []).append(a)
    start = next(iter(links))
    order, prev = [start], None
    while True:
        cur = order[-1]
        nxt = next(p for p in links[cur] if p is not prev)
        if nxt is start:
            return order
        prev = cur
        order.append(nxt)


def hole(s, bm, side):
    """Gives the ordered vertices of the hole of the seam of one side: the longest open loop on
    that side near the upper arm (within `seam.hole` units, 0.16 by default), with no vertex of
    the wrist cut."""
    a, e, _, _ = va.arm_line(s, side)
    reach = s.units(s.spec['seam'].get('hole', 0.16))
    part = bm.verts.layers.int['arm_part']
    wrist = PART['wrist'] + (0 if side > 0 else 10)
    edges = [x for x in bm.edges if x.is_boundary
             and all(p.co.x * side > 0 and va.seg_distance(p.co, a, e) < reach
                     and p[part] != wrist for p in x.verts)]
    loops = va.edge_loops(edges)
    return walk(max(loops, key=len))


def step_wall(s):
    """Splits each hole into the top arc and the lower run at the height `seam.armpit`, draws the
    armpit line across the plane of the seam, and fills the side wall of the trunk under the arm.

    Bisect gives a vertex where the hole crosses the height in front (F) and at the back (B). The
    armpit line is a straight run of new vertices from B to F on the plane. Fill (Beauty) makes the
    wall from the lower run and the armpit line, with the normals out of the trunk.
    """
    mesh, seam = s.mesh, s.spec['seam']
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(mesh.data)
    part = bm.verts.layers.int['arm_part']
    zone = bm.faces.layers.int['arm_zone']
    height = s.fr.floor + s.units(seam['edge'])
    rise = s.units(seam['armpit'] - seam['edge'])
    out = {}
    for side in (1, -1):
        off = 0 if side > 0 else 10
        plane_co, plane_no = seam_plane(s, side)
        loop = hole(s, bm, side)
        n = len(loop)
        crossings = []
        for k in range(n):
            p, q = loop[k], loop[(k + 1) % n]
            if (p.co.z - height) * (q.co.z - height) < 0:
                fac = (height - p.co.z) / (q.co.z - p.co.z)
                crossings.append((p, q, fac, -(p.co.y + (q.co.y - p.co.y) * fac)))
        crossings.sort(key=lambda c: c[3])
        made = []
        for p, q, fac, _ in (crossings[0], crossings[-1]):
            x = next(x for x in p.link_edges if x.other_vert(p) is q)
            _, v = bmesh.utils.edge_split(x, p, fac)
            made.append(v)
        back, front = made
        loop = hole(s, bm, side)
        k_front, k_back = loop.index(front), loop.index(back)
        # The two runs between F and B: the top arc holds the highest vertex.
        run1 = [loop[(k_front + i) % len(loop)]
                for i in range((k_back - k_front) % len(loop) + 1)]
        run2 = [loop[(k_back + i) % len(loop)]
                for i in range((k_front - k_back) % len(loop) + 1)]
        top, low = ((run1, run2) if max(p.co.z for p in run1) > max(p.co.z for p in run2)
                    else (run2, run1))
        for p in top:
            p[part] = PART['shoulder'] + off
        for p in low:
            p[part] = PART['wall'] + off
        # The armpit line from B to F.
        step = sum((top[i + 1].co - top[i].co).length for i in range(len(top) - 1)) / (len(top) - 1)
        count = max(2, round(((front.co - back.co).length + 2 * rise) / step))
        line = [back]
        for i in range(1, count):
            # The arch of the armpit: `seam.armpit` high in the middle, on the plane of the seam.
            up = rise * math.sin(math.pi * i / count)
            v = bm.verts.new(back.co.lerp(front.co, i / count)
                             + Vector((-side * seam['lean'] * up, 0.0, up)))
            v[part] = PART['armpit'] + off
            line.append(v)
        line.append(front)
        back[part] = front[part] = PART['armpit'] + off
        new_edges = [bm.edges.new((line[i], line[i + 1])) for i in range(len(line) - 1)]
        low_edges = [x for i in range(len(low) - 1) for x in low[i].link_edges
                     if x.other_vert(low[i]) is low[i + 1]]
        res = bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False,
                                      edges=low_edges + new_edges, normal=plane_no)
        wall = [f for f in res['geom'] if isinstance(f, bmesh.types.BMFace)]
        for f in wall:
            f[zone] = 3
            f.smooth = True
            f.normal_update()
            if f.normal.dot(plane_no) < 0:
                f.normal_flip()
        out[side] = (len(top), len(low), count, len(wall))
    bmesh.update_edit_mesh(mesh.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    look(s, '3-wall', [mesh])
    return out


def section(bm, point, axis, reach):
    """Gives the points where the edges of a mesh cross a plane, within `reach` of `point`."""
    pts = []
    for x in bm.edges:
        a, b = x.verts
        da, db = (a.co - point).dot(axis), (b.co - point).dot(axis)
        if da * db < 0:
            p = a.co.lerp(b.co, da / (da - db))
            if (p - point).length < reach:
                pts.append(p)
    return pts


def ring_frame(axis):
    """Gives the two directions of a ring plane: up across the axis, and the third direction."""
    up = Vector((0, 0, 1))
    ref = (up - axis * axis.dot(up)).normalized()
    return ref, axis.cross(ref)


def fit_ring(pts, point, axis):
    """Fits the circle of a ring to the section points of the source arm in its plane.

    A section that goes round the arm gives its mean center and mean radius, as
    `violin_arms.build_tube()`. A section of the upper arm is an arc, because the inner side of the
    arm lies in the trunk: a least squares circle through the arc gives the center and the radius.
    Gives the center, the radius, and True for an arc.
    """
    import numpy as np
    ref, across = ring_frame(axis)
    uv = np.array([[(p - point).dot(ref), (p - point).dot(across)] for p in pts])
    angles = np.sort(np.arctan2(uv[:, 1] - uv[:, 1].mean(), uv[:, 0] - uv[:, 0].mean()))
    gaps = np.diff(np.concatenate([angles, angles[:1] + 2 * np.pi]))
    if gaps.max() < math.radians(70):
        center = sum(pts, Vector()) / len(pts)
        return center, sum((p - center).length for p in pts) / len(pts), False
    m = np.column_stack([uv, np.ones(len(uv))])
    sol = np.linalg.lstsq(m, -(uv ** 2).sum(axis=1), rcond=None)[0]
    cu, cv = -sol[0] / 2, -sol[1] / 2
    radius = math.sqrt(max(cu * cu + cv * cv - sol[2], 0.0))
    return point + ref * cu + across * cv, radius, True


def flatten(s, side, p, axis, keep=False):
    """Puts a ring vertex that lies within `seam.lift` of the plane of the seam, or beyond it in
    the trunk, onto the plane at the gap `seam.lift`, along the ring plane. With `keep`, the vertex
    goes onto the plane from each side. Gives True on a move."""
    plane_co, plane_no = seam_plane(s, side)
    lift = s.units(s.spec['seam']['lift'])
    h = (p.co - plane_co).dot(plane_no)
    if h >= lift and not keep:
        return False
    d = (plane_no - axis * axis.dot(plane_no)).normalized()
    p.co += d * ((lift - h) / d.dot(plane_no))
    return True


def resample(points, count, start):
    """Gives `count` points at equal steps along a closed polyline, from the point `start`."""
    pts = points[start:] + points[:start]
    lengths = [(pts[(i + 1) % len(pts)] - pts[i]).length for i in range(len(pts))]
    total = sum(lengths)
    out, i, run = [], 0, 0.0
    for k in range(count):
        goal = total * k / count
        while run + lengths[i] < goal:
            run += lengths[i]
            i += 1
        out.append(pts[i].lerp(pts[(i + 1) % len(pts)], (goal - run) / lengths[i]))
    return out


def step_tube(s):
    """Models the quad tube of each arm, wraps it onto the source arm, and bridges it to the
    socket (the top arc and the armpit line) and to the paw.

    The rings of `violin_arms.arm_stations()` stand at a right angle to the bones (`fit_ring()`).
    `seam.rings` rings between the socket and the first ring blend from the socket to that ring,
    so that the shoulder has rings too. Shrinkwrap (Project, both directions, with a limit) puts
    the outer vertices on the source arm, and the vertices of the inner side stay on the plane of
    the seam (`flatten()`). Bridge Edge Loops joins the socket to the first ring and the last ring
    to the paw, with the twist of the shortest edges (`violin_arms.bridge_twist()`).
    """
    mesh, seam = s.mesh, s.spec['seam']
    src = bmesh.new()
    src.from_mesh(s.arm.data)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(mesh.data)
    part = bm.verts.layers.int['arm_part']
    spoke = bm.verts.layers.int['arm_spoke']
    flat = bm.verts.layers.int.get('arm_flat') or bm.verts.layers.int.new('arm_flat')
    index = bm.verts.layers.int.get('arm_ring') or bm.verts.layers.int.new('arm_ring')
    out = {}
    s.axes = {}
    for side in (1, -1):
        off = 0 if side > 0 else 10
        line = va.arm_line(s, side)
        stations = va.arm_stations(s, line)
        fits, rings = [], []
        for point, axis in stations:
            pts = [p for p in section(src, point, axis, s.units(0.09))
                   if p.x * side > 0]
            center, radius, arc = fit_ring(pts, point, axis)
            fits.append((round((center - point).length / s.fr.height, 4),
                         round(radius / s.fr.height, 4), arc))
            ref, across = ring_frame(axis)
            ring = []
            for k in range(RING_VERTS):
                a = 2 * math.pi * k / RING_VERTS
                p = bm.verts.new(center + (ref * math.cos(a) + across * math.sin(a)) * radius)
                p[part] = PART['tube'] + off
                p[spoke] = k
                ring.append(p)
            rings.append((ring, axis))
        # The rings of the shoulder: from the socket to the first ring.
        socket = [p for p in hole(s, bm, side)]
        first, axis0 = rings[0]
        ref, across = ring_frame(axis0)
        center0 = sum((p.co for p in first), Vector()) / RING_VERTS
        top = max(range(len(socket)), key=lambda i: (socket[i].co - center0).dot(ref))
        nxt = socket[(top + 1) % len(socket)].co - socket[top].co
        if nxt.dot(across) < 0:
            socket = socket[::-1]
            top = len(socket) - 1 - top
        blend = resample([p.co.copy() for p in socket], RING_VERTS, top)
        shoulder = []
        for t in seam['rings']:
            ring = []
            for j in range(RING_VERTS):
                p = bm.verts.new(blend[j].lerp(first[j].co, t))
                p[part] = PART['tube'] + off
                p[spoke] = j
                ring.append(p)
            shoulder.append((ring, axis0))
        rings = shoulder + rings
        s.axes[side] = [axis for _, axis in rings]
        for k, (ring, axis) in enumerate(rings):
            for p in ring:
                p[flat] = 1 if flatten(s, side, p, axis) else 0
                p[index] = k
        for (r0, _), (r1, _) in zip(rings, rings[1:]):
            for k in range(RING_VERTS):
                j = (k + 1) % RING_VERTS
                bm.faces.new((r0[k], r0[j], r1[j], r1[k])).smooth = True
        out[side] = fits
    src.free()
    bmesh.update_edit_mesh(mesh.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    look(s, '4-tube', [mesh])
    return out


def reflatten(s, bm):
    """Puts the inner side of each tube back onto the plane of the seam after a move: the vertices
    of the inner side from each side, and the other vertices of the tube from the trunk only."""
    part = bm.verts.layers.int['arm_part']
    index = bm.verts.layers.int['arm_ring']
    flat = bm.verts.layers.int['arm_flat']
    moved = 0
    for side, off in ((1, 0), (-1, 10)):
        for p in bm.verts:
            if p[part] == PART['tube'] + off:
                moved += flatten(s, side, p, s.axes[side][p[index]], keep=p[flat] == 1)
    return moved


def step_wrap(s):
    """Puts the outer vertices of each tube on the surface of the source arm with a Shrinkwrap
    modifier (Project, both directions, with the limit `seam.wrap`), and the inner side back on the
    plane of the seam. The limit keeps a vertex of the inner side, which no surface of the source
    arm faces, in its ring."""
    mesh = s.mesh
    attr = mesh.data.attributes
    part, flat = attr['arm_part'].data, attr['arm_flat'].data
    group = mesh.vertex_groups.new(name='retopo')
    group.add([i for i in range(len(part)) if part[i].value in (PART['tube'], PART['tube'] + 10)
               and flat[i].value == 0], 1.0, 'REPLACE')
    mod = mesh.modifiers.new('wrap', 'SHRINKWRAP')
    mod.target = s.arm
    mod.wrap_method = 'PROJECT'
    mod.use_project_x = mod.use_project_y = mod.use_project_z = False
    mod.use_negative_direction = mod.use_positive_direction = True
    mod.cull_face = 'OFF'
    mod.project_limit = s.units(s.spec['seam']['wrap'])
    mod.vertex_group = group.name
    va.apply_modifier(mesh, mod)
    mesh.vertex_groups.remove(mesh.vertex_groups['retopo'])
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(mesh.data)
    moved = reflatten(s, bm)
    bmesh.update_edit_mesh(mesh.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    look(s, '5-wrap', [mesh])
    return moved


def step_bridge(s):
    """Joins the first ring of each tube to the socket (the top arc and the armpit line) and the
    last ring to the paw with Bridge Edge Loops, with the twist of the shortest edges."""
    mesh = s.mesh
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(mesh.data)
    part = bm.verts.layers.int['arm_part']
    made = 0
    for side, off in ((1, 0), (-1, 10)):
        tube = PART['tube'] + off
        ends = va.edge_loops([x for x in bm.edges if x.is_boundary
                              and all(p[part] == tube for p in x.verts)])
        socket_codes = (PART['shoulder'] + off, PART['armpit'] + off)
        for codes in (socket_codes, (PART['wrist'] + off,)):
            loop = [x for x in bm.edges if x.is_boundary and all(p[part] in codes for p in x.verts)]
            center = va.loop_center(loop)
            ring = min(ends, key=lambda r: (va.loop_center(r) - center).length)
            res = bmesh.ops.bridge_loops(bm, edges=loop + ring,
                                         twist_offset=va.bridge_twist(bm, loop + ring))
            for f in res['faces']:
                f.smooth = True
            made += len(res['faces'])
    bmesh.update_edit_mesh(mesh.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    return made


def step_beautify(s):
    """Runs Beautify Faces on the bridge triangles of each arm (`violin_arms.step_beautify()`)."""
    out = va.step_beautify(s)
    look(s, '6-bridge', [s.mesh])
    look(s, '6-shoulder', [s.mesh], center=(0.1, 0.63, 0.05), scale=0.13,
         views=(('side', 90, 0), ('b35', 145, 10), ('back', 180, 0), ('top', 120, 50)))
    return out


TUBE_FACES = va.arm_faces


def new_faces(bm, part):
    """Gives the new faces of the arms (the tubes and the bridges) and of the side walls, which
    take the material, the UV layout, and the bake of `violin_arms.step_uv()` and
    `violin_arms.step_bake()`."""
    zone = bm.faces.layers.int['arm_zone']
    return TUBE_FACES(bm, part) + [f for f in bm.faces if f[zone] == 3]


va.arm_faces = new_faces


def arm_verts(s, bm, part, off):
    """Gives the vertices of one arm: the tube, the wrist loop, and the paw, which the tube reaches
    with no step over the socket (`violin_arms.arm_verts()` for an arm with a side wall)."""
    stop = {PART[k] + off for k in ('shoulder', 'armpit', 'wall')}
    arm, stack = set(), [p for p in bm.verts if p[part] == PART['tube'] + off]
    while stack:
        p = stack.pop()
        if p in arm:
            continue
        arm.add(p)
        if p[part] not in stop:
            stack += [x.other_vert(p) for x in p.link_edges]
    return {p for p in arm if p[part] not in stop}


va.arm_verts = arm_verts


def step_clean_pit(s):
    """Cleans the band between each armpit line and the flat inner side of the arm (`pit`).

    The first ring of the shoulder lies 0.15 of the way from the socket to the first ring of the
    tube. On the flat inner side of the arm, that way is short, and `step_shape()` makes it
    shorter, so the first ring lies 0.1 to 0.5 units-cm from the armpit line, and at the ends of
    the line the second ring comes as near. Bridge Edge Loops joins the line to these vertices
    with thin triangles, and at the front end of the left line three of their corners lie on one
    line. In the play, these faces turn over when the skin near them moves, and a smoothing of
    the root front shows them as a slit and as lumps. The step:

    1. Ring by ring, a vertex of the first two shoulder rings below the line and within `near`
       units of it (one value for each ring) merges into the vertex of the next ring on its
       spoke (Merge at First). At the back half of the line, a vertex above the line and within
       `close` units of it merges into the nearest vertex of the line. The kept vertex keeps its
       place, its codes, and its later weights.
    2. A socket vertex within `weld` units of an end of the line merges into the end, and a
       socket edge shorter than `weld` units collapses to its middle (Collapse Edges): the cut
       of the seam left such vertices, and each face with two of them is thin.
    3. The faces with a vertex of the line and a vertex of the tube go, and a new strip of
       triangles joins the line to the other side of the hole (`stitch_band()`).

    The line keeps its vertices, so the side wall stays. The step cleans the sides of `sides`.
    Gives for each side the counts of the merged ring vertices, of the merged socket vertices,
    and of the old and the new faces.
    """
    from mathutils.geometry import intersect_point_line
    rule = s.spec.get('pit')
    if rule is None:
        return None
    mesh = s.mesh
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(mesh.data)
    part = bm.verts.layers.int['arm_part']
    index = bm.verts.layers.int['arm_ring']
    spoke = bm.verts.layers.int['arm_spoke']
    out = {}
    for side, off in ((1, 0), (-1, 10)):
        if 'LR'[off // 10] not in rule['sides']:
            continue
        tube, pit, socket = (PART[k] + off for k in ('tube', 'armpit', 'shoulder'))
        # The line from its front end to its back end (the front is at -y).
        line = sorted((p for p in bm.verts if p[part] == pit), key=lambda p: p.co.y)
        height = sum(p.co.z for p in line) / len(line)

        def distance(co):
            best = math.inf
            for a, b in zip(line, line[1:]):
                _, t = intersect_point_line(co, a.co, b.co)
                best = min(best, (co - a.co.lerp(b.co, min(1.0, max(0.0, t)))).length)
            return best

        def at_back(co):
            nearest = min(line, key=lambda p: (p.co - co).length)
            return line.index(nearest) >= len(line) // 2

        # 1. The shoulder rings near the line.
        merged = 0
        for k, reach in enumerate(rule['near']):
            below = [p for p in bm.verts if p.is_valid and p[part] == tube and p[index] == k
                     and p.co.z < height and distance(p.co) < s.units(reach)]
            close = [p for p in bm.verts if p.is_valid and p[part] == tube and p[index] == k
                     and p not in below and distance(p.co) < s.units(rule['close'])
                     and at_back(p.co)]
            for p in below + close:
                if p in below:
                    q = next(x.other_vert(p) for x in p.link_edges
                             if x.other_vert(p)[part] == tube and x.other_vert(p)[index] == k + 1
                             and x.other_vert(p)[spoke] == p[spoke])
                else:
                    q = min(line, key=lambda v: (v.co - p.co).length)
                merge_into(bm, q, p)
                merged += 1
        # 2. The socket vertices near the ends of the line and near each other.
        welded = 0
        for end in (line[0], line[-1]):
            for p in [p for p in bm.verts if p.is_valid and p[part] == socket
                      and (p.co - end.co).length < s.units(rule['weld'])]:
                merge_into(bm, end, p)
                welded += 1
        short = [x for x in bm.edges if all(p[part] == socket for p in x.verts)
                 and x.calc_length() < s.units(rule['weld'])]
        bmesh.ops.collapse(bm, edges=short, uvs=True)
        welded += len(short)
        # 3. The new strip.
        out[side] = (merged, welded, stitch_band(bm, part, pit, tube))
    bmesh.update_edit_mesh(mesh.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    return out


def merge_into(bm, keep, gone):
    """Merges the vertex `gone` into the vertex `keep` (Merge at First). `keep` keeps its place and
    its codes (the integer layers of the vertices): the merge mixes them."""
    layers = list(bm.verts.layers.int.values())
    codes = [keep[layer] for layer in layers]
    bmesh.ops.pointmerge(bm, verts=[keep, gone], merge_co=keep.co.copy())
    for layer, code in zip(layers, codes):
        keep[layer] = code


def least_angle(tri):
    """Gives the smallest corner angle of a triangle of three vertices, in radians."""
    out = math.pi
    for p, q, r in (tri, tri[1:] + tri[:1], tri[2:] + tri[:2]):
        u, w = q.co - p.co, r.co - p.co
        if u.length < 1e-12 or w.length < 1e-12:
            return 0.0
        out = min(out, u.angle(w))
    return out


def stitch_band(bm, part, pit, tube):
    """Fills the band between an armpit line (the vertices with the code `pit`) and the tube again
    (`step_clean_pit()`). The faces with a vertex of the line and a vertex of the tube go. Their
    hole has the run of the line P0 ... Pn on one side and Q0 = P0, Q1, ..., Qm = Pn on the other.
    From the edge P0 Q1 to the edge Pn Qm-1, each new triangle takes the next vertex of P or of
    Q, as Bridge Edge Loops joins two loops of different counts. Of all such strips, the step
    takes the strip whose smallest corner is the largest, then the largest sum of the smallest
    corners of its triangles. A new face takes the zone of the side wall when its other corners
    lie on the flat inner side of the arm, as Bridge Edge Loops gave it, and each corner the UV
    of its vertex in the old band. Gives the counts of the old and the new faces."""
    band = [f for f in bm.faces
            if any(p[part] == pit for p in f.verts) and any(p[part] == tube for p in f.verts)]
    uv = bm.loops.layers.uv.active
    zone = bm.faces.layers.int['arm_zone']
    flat = bm.verts.layers.int['arm_flat']
    # The UVs of the bake win over the UVs of the zone of the wall.
    uvs = {loop.vert: loop[uv].uv.copy() for f in band for loop in f.loops}
    uvs.update({loop.vert: loop[uv].uv.copy() for f in band if f[zone] != 3
                for loop in f.loops})
    material = band[0].material_index
    # The outline of the hole, in the order of the corners of the old faces.
    after = {}
    for f in band:
        for loop in f.loops:
            if sum(g in band for g in loop.edge.link_faces) == 1:
                after[loop.vert] = loop.link_loop_next.vert
    outline = [next(iter(after))]
    while after[outline[-1]] is not outline[0]:
        outline.append(after[outline[-1]])
    if len(outline) != len(after):
        raise RuntimeError('The band of the armpit line has more than one outline.')
    k = next(i for i in range(len(outline))
             if outline[i][part] == pit and outline[i - 1][part] != pit)
    outline = outline[k:] + outline[:k]
    n = next(i for i in range(len(outline)) if outline[i][part] != pit) - 1
    line = outline[:n + 1]
    other = (outline[n:] + outline[:1])[::-1]
    m = len(other) - 1
    bmesh.ops.delete(bm, geom=band, context='FACES')
    # The best strip to each state (i, j), the edge Pi Qj: its smallest corner, the sum of the
    # smallest corners, and its triangles.
    best = {(0, 1): (math.inf, 0.0, ())}
    for i in range(n + 1):
        for j in range(1, m):
            if (i, j) not in best:
                continue
            worst, total, tris = best[(i, j)]
            steps = []
            if i < n:
                steps.append(((i + 1, j), (line[i], line[i + 1], other[j])))
            if j < m - 1:
                steps.append(((i, j + 1), (line[i], other[j + 1], other[j])))
            for state, tri in steps:
                angle = least_angle(tri)
                score = (min(worst, angle), total + angle, tris + (tri,))
                if state not in best or score[:2] > best[state][:2]:
                    best[state] = score
    made = [bm.faces.new(tri) for tri in best[(n, m - 1)][2]]
    for f in made:
        f.smooth = True
        f[zone] = 3 if all(p[part] == pit or (p[part] == tube and p[flat]) for p in f.verts) else 0
        f.material_index = material
        for loop in f.loops:
            loop[uv].uv = uvs[loop.vert]
    return len(band), len(made)


def step_uv(s):
    """Gives the new faces their material and UV layout (`violin_arms.step_uv()`)."""
    return va.step_uv(s)


def step_bake(s):
    """Bakes the fur color of the source arms onto the new faces (`violin_arms.step_bake()`)."""
    return va.step_bake(s)


def step_shape(s):
    """Gives the arms the cross-section and the length of the app body
    (`violin_arms.step_shape()`), then puts the inner side back onto the plane of the seam."""
    out = va.step_shape(s)
    bm = bmesh.new()
    bm.from_mesh(s.mesh.data)
    moved = reflatten(s, bm)
    rounded = round_corners(s, bm)
    bm.to_mesh(s.mesh.data)
    bm.free()
    s.mesh.data.update()
    return out, moved, rounded


def round_corners(s, bm):
    """Rounds the two edges of the flat inner side of each tube (Smooth Vertices, `seam.round`
    times): the last vertex of each ring on the round side and the first on the flat side. A
    sharp edge there folded in the poses and showed as a dark slit at the back of the arm."""
    part = bm.verts.layers.int['arm_part']
    flat = bm.verts.layers.int['arm_flat']
    index = bm.verts.layers.int['arm_ring']
    tubes = (PART['tube'], PART['tube'] + 10)
    corner = set()
    for p in bm.verts:
        if p[part] not in tubes:
            continue
        for x in p.link_edges:
            q = x.other_vert(p)
            if q[part] in tubes and q[index] == p[index] and q[flat] != p[flat]:
                corner.update((p, q))
    for _ in range(s.spec['seam']['round']):
        bmesh.ops.smooth_vert(bm, verts=list(corner), factor=0.5, use_axis_x=True,
                              use_axis_y=True, use_axis_z=True)
    return len(corner)


#: The codes of `arm_part` on the surface of the trunk: the faces of the source, and the side
#: walls with their armpit lines. The tube, the shoulder rings, and the paw cut stay.
TRUNK_PARTS = (0, PART['wall'], PART['wall'] + 10, PART['armpit'], PART['armpit'] + 10)


def trunk_frame(s, points):
    """Gives the place of points of the studio along the line from the hips joint to the neck
    joint of the config, as a share `f` of the line, and their distances from the line forward
    (`d`) and to the left (`x`), in units. Gives also the length of the line, and the unit
    directions forward and to the left."""
    import numpy as np
    joints = s.config['joints']
    hips = np.array(joints['hips']['head'], float)
    up = np.array(joints['neck']['head'], float) - hips
    length = float(np.linalg.norm(up))
    up /= length
    forward = np.array([0.0, 0.0, 1.0]) - up[2] * up
    forward /= np.linalg.norm(forward)
    left = np.cross(up, forward)
    rel = points - hips
    return rel @ up / length, rel @ forward, rel @ left, length, forward, left


def trunk_cuts(f, d, x, tris, levels):
    """Cuts the mesh across the line of `trunk_frame()` at each share of `levels`, and keeps the
    loop of each cut that holds the line: a ray from the line to the left crosses it an odd
    number of times. The arm tubes and the paws are other loops below the armpit. Gives for each
    level the front (the largest `d`), the left side (the largest `x`), and the right side (the
    largest `-x`) of that loop, and the vertices of its faces."""
    import numpy as np
    out = []
    for level in levels:
        side = f[tris] > level
        cut = np.nonzero(side.any(axis=1) & ~side.all(axis=1))[0]
        parent = {}

        def root(k):
            while parent[k] != k:
                parent[k] = parent[parent[k]]
                k = parent[k]
            return k

        segments = []
        for t in cut:
            ends = []
            for i in range(3):
                a, b = int(tris[t, i]), int(tris[t, (i + 1) % 3])
                if side[t, i] != side[t, (i + 1) % 3]:
                    r = (f[a] - level) / (f[a] - f[b])
                    key = (min(a, b), max(a, b))
                    parent.setdefault(key, key)
                    ends.append((key, (x[a] + (x[b] - x[a]) * r, d[a] + (d[b] - d[a]) * r)))
            if len(ends) == 2:
                parent[root(ends[1][0])] = root(ends[0][0])
                segments.append((t, ends[0][1], ends[1][1], ends[0][0]))
        groups = {}
        for t, p, q, key in segments:
            groups.setdefault(root(key), []).append((t, p, q))
        best = None
        for group in groups.values():
            crossings = 0
            for _, (x1, d1), (x2, d2) in group:
                if (d1 > 0) != (d2 > 0) and x1 + (0 - d1) * (x2 - x1) / (d2 - d1) > 0:
                    crossings += 1
            if crossings % 2 == 1 and (best is None or len(group) > len(best)):
                best = group
        if best is None:
            out.append(None)
            continue
        xs = [v for _, p, q in best for v in (p[0], q[0])]
        ds = [v for _, p, q in best for v in (p[1], q[1])]
        verts = {int(v) for t, _, _ in best for v in tris[t]}
        out.append((max(ds), max(xs), -min(xs), verts))
    return out


def pinned_arc(ts, ws, ends):
    """Fits the arc of an ellipse `w = w0 + sqrt(a + b t + c t^2)` (c < 0) to an outline, through
    the outline at the two ends: the least squares over the outline between the ends, with `w0`
    on a grid. Gives the arc as a function of `t`."""
    import numpy as np
    ta, tb = ends
    wa, wb = np.interp(ta, ts, ws), np.interp(tb, ts, ws)
    inside = (ts >= ta) & (ts <= tb)
    rows = np.stack([np.ones(inside.sum()), ts[inside], ts[inside] ** 2], 1)
    ends_rows = np.array([[1.0, ta, ta ** 2], [1.0, tb, tb ** 2]])
    free = np.linalg.svd(ends_rows)[2][-1]
    best = None
    for w0 in np.linspace(-3.0 * ws[inside].mean(), 0.95 * min(wa, wb), 400):
        base = np.linalg.lstsq(ends_rows, [(wa - w0) ** 2, (wb - w0) ** 2], rcond=None)[0]
        rest = (ws[inside] - w0) ** 2 - rows @ base
        along = rows @ free
        coef = base + (along @ rest) / (along @ along) * free
        if coef[2] >= 0:
            continue
        err = np.sum((w0 + np.sqrt(np.maximum(0.0, rows @ coef)) - ws[inside]) ** 2)
        if best is None or err < best[0]:
            best = (err, w0, coef)
    _, w0, coef = best
    return lambda t: w0 + np.sqrt(np.maximum(0.0, coef[0] + coef[1] * t + coef[2] * t * t))


def pinned_smooth(ts, ws, ends, bend):
    """Gives an even curve near an outline between two ends, through the outline at the ends:
    the least squares of the distance to the outline plus `bend` times the squares of the second
    differences, on the cuts between the ends (a Whittaker smoother). A corner or a notch of the
    outline becomes a smooth turn. Gives the curve as a function of `t`."""
    import numpy as np
    ta, tb = ends
    inside = (ts >= ta) & (ts <= tb)
    grid = np.concatenate([[ta], ts[inside], [tb]])
    values = np.interp(grid, ts, ws)
    n = len(grid)
    second = np.zeros((n - 2, n))
    for i in range(n - 2):
        second[i, i:i + 3] = (1.0, -2.0, 1.0)
    system = np.eye(n) + bend * second.T @ second
    target = values.copy()
    for k in (0, n - 1):
        system[k] = 0.0
        system[k, k] = 1.0
    curve = np.linalg.solve(system, target)
    return lambda t: np.interp(t, grid, curve)


def step_belly(s):
    """Makes the trunk an even oval from the front and from the side (`belly`).

    The trunk of the source mesh is not an even oval. In the side view, the chest is upright, and
    the belly leans out below it to a peak at 0.33 of the trunk line, with a steep step at its
    lower end. In the front view, the sides are a straight cone with a corner at the hips and a
    notch below each side wall. Along the middle line, the belly has a ridge. The trunk factor of
    the rig (`trunkFactor` 0.686) makes each turn steeper, and the seat shows them as a pinch at
    the waist and a lump below it.

    1. Each cut across the trunk line (`trunk_cuts()`) gives the front and the two sides of the
       trunk at its height.
    2. The new front is the arc of an ellipse through the front at the two ends of `front`
       (`pinned_arc()`), and each new side an even curve through the side at the two ends of
       `sides` (`pinned_smooth()`). A side has a waist under the arm, so no ellipse arc fits it.
    3. Each vertex of the trunk surface (`TRUNK_PARTS`) between the ends moves: in the front
       half, its distance forward from the line takes the factor of the front at its height,
       and on each side, its distance from the middle plane takes the factor of its side. So
       each cut grows or shrinks as a whole, the facets keep their relief, and the back half
       keeps its depth. The side walls take no side move, so they stay in the plane of the seam.
    4. Each vertex of the belly front moves the share `round.share` of the way to the half
       ellipse through the front and the two sides of its cut, so that the ridge rounds out. The
       share fades out toward the sides (`round.fade`, in shares of the half width), and over
       0.05 at each end of `front`.
    5. With `flat`, each vertex of the front half of the trunk between the shares `flat.f` moves
       toward the trunk line in its cut, by `flat.move` units times a sine squared over `flat.f`
       and over the angle from the front (`flat.angle`, degrees). A range that holds the middle
       line moves the whole front of the upper belly, most at the middle, so the cut gets
       flatter with no crease beside the middle strip, where the bow upper arm lies in the
       play. The sides keep their places, so the front view keeps the oval.

    The ends keep their places, so the trunk joins the chest and the thighs with no step. The
    custom normals of the moved vertices stay: the rig reads no normal of the source.
    """
    import numpy as np
    if 'belly' not in s.spec:
        return None
    rule = s.spec['belly']
    data = s.mesh.data
    fr = s.fr
    co = np.array([v.co[:] for v in data.vertices])
    points = np.stack([co[:, 0], co[:, 2] - fr.floor, -co[:, 1]], 1) / fr.height
    f, d, x, length, forward, left = trunk_frame(s, points)
    data.calc_loop_triangles()
    tris = np.array([t.vertices[:] for t in data.loop_triangles], np.int64)

    step = rule['step'] / length
    low = min(rule['front'][0], rule['sides'][0])
    high = max(rule['front'][1], rule['sides'][1])
    levels = np.arange(low - 2 * step, high + 2 * step, step)
    cuts = trunk_cuts(f, d, x, tris, levels)
    kept = [k for k, c in enumerate(cuts) if c is not None]
    ts = levels[kept]
    front = np.array([cuts[k][0] for k in kept])
    sides = {1: np.array([cuts[k][1] for k in kept]), -1: np.array([cuts[k][2] for k in kept])}
    part = np.array([a.value for a in data.attributes['arm_part'].data])
    trunk = np.zeros(len(points), bool)
    for k in kept:
        trunk[list(cuts[k][3])] = True
    trunk &= np.isin(part, TRUNK_PARTS)
    walls = np.isin(part, TRUNK_PARTS[1:])

    a, b = rule['front']
    goal_front = np.where((ts > a) & (ts < b), pinned_arc(ts, front, (a, b))(ts), front)
    a, b = rule['sides']
    goal_sides = {sign: np.where((ts > a) & (ts < b),
                                 pinned_smooth(ts, sides[sign], (a, b), rule['bend'])(ts),
                                 sides[sign]) for sign in (1, -1)}

    a, b = rule['front']
    belly = trunk & (f > a) & (f < b) & (d > 0)
    new_d = np.where(belly, d * np.interp(f, ts, goal_front) / np.interp(f, ts, front), d)
    a, b = rule['sides']
    new_x = x.copy()
    for sign in (1, -1):
        on = trunk & ~walls & (f > a) & (f < b) & (sign * x > 0)
        new_x[on] = x[on] * (np.interp(f[on], ts, goal_sides[sign])
                             / np.interp(f[on], ts, sides[sign]))

    share, (full, none) = rule['round']['share'], rule['round']['fade']
    a, b = rule['front']
    width = np.where(new_x >= 0, np.interp(f, ts, goal_sides[1]), np.interp(f, ts, goal_sides[-1]))
    u = np.abs(new_x) / np.maximum(width, 1e-9)
    ellipse = np.interp(f, ts, goal_front) * np.sqrt(np.clip(1.0 - u * u, 0.0, 1.0))
    ends = np.minimum(np.clip((f - a) / 0.05, 0, 1), np.clip((b - f) / 0.05, 0, 1))
    weight = share * (1.0 - np.clip((u - full) / (none - full), 0.0, 1.0)) * ends
    new_d = np.where(belly, new_d + weight * (ellipse - new_d), new_d)

    if 'flat' in rule:
        flat = rule['flat']
        a, b = flat['f']
        low, high = np.radians(flat['angle'])
        turn = np.arctan2(np.abs(new_x), new_d)
        along = np.clip((f - a) / (b - a), 0.0, 1.0)
        around = np.clip((turn - low) / (high - low), 0.0, 1.0)
        weight = np.where(trunk & ~walls & (new_d > 0), (np.sin(np.pi * along)
                                                         * np.sin(np.pi * around)) ** 2, 0.0)
        reach = np.hypot(new_d, new_x)
        shrink = 1.0 - flat['move'] * weight / np.maximum(reach, 1e-9)
        new_d, new_x = new_d * shrink, new_x * shrink

    moved = points + (new_d - d)[:, None] * forward + (new_x - x)[:, None] * left
    out = np.stack([moved[:, 0], -moved[:, 2], moved[:, 1]], 1) * fr.height + [0.0, 0.0, fr.floor]
    for v, p in zip(data.vertices, out):
        v.co = Vector(p)
    data.update()
    shift = np.linalg.norm(moved - points, axis=1)
    look(s, '6-belly', [s.mesh], center=(0.0, 0.42, 0.05), scale=0.45)
    return int((shift > 1e-12).sum()), round(float(shift.max()), 5)


def wall_grid(outline, step):
    """Gives the points of a grid of triangles of the side `step` inside a closed outline (a list
    of 2D points), each at least 0.55 `step` from the outline."""
    def inside(u, v):
        hit = False
        for k in range(len(outline)):
            (u1, v1), (u2, v2) = outline[k - 1], outline[k]
            if (v1 > v) != (v2 > v) and u < u1 + (v - v1) * (u2 - u1) / (v2 - v1):
                hit = not hit
        return hit

    def gap(u, v):
        best = math.inf
        for k in range(len(outline)):
            a, b = Vector(outline[k - 1]), Vector(outline[k])
            ab = b - a
            t = max(0.0, min(1.0, (Vector((u, v)) - a).dot(ab) / max(ab.length_squared, 1e-18)))
            best = min(best, (Vector((u, v)) - (a + ab * t)).length)
        return best
    us = [u for u, _ in outline]
    vs = [v for _, v in outline]
    points, row, v = [], 0, min(vs) + step * 0.5
    while v < max(vs):
        u = min(us) + (step * 0.5 if row % 2 else 0.0)
        while u < max(us):
            if inside(u, v) and gap(u, v) > 0.55 * step:
                points.append((u, v))
            u += step
        v += step * math.sqrt(0.75)
        row += 1
    return points


def step_round_wall(s):
    """Rounds the side wall of each arm into the trunk (`wall`).

    The fill of `step_wall()` is a flat plate on the plane of the seam: a fan of long thin faces
    with no vertex inside. The Bisect of the seam also leaves lips at its lower run: small trunk
    faces that turn back under the plate. In the play, the raised arm shows the plate as a light
    patch and the lips as a crease at its lower tip. This step makes the wall again:

    1. The lips go (Delete Faces): from the lower run, each trunk face whose normal makes a dot
       product of at most `lip` with the normal of the plane, and that lies within `depth` units
       of the plane and at most `over` units over the armpit line, with its neighbors of the same
       kind. A vertex of the outline more than 0.002 units over the armpit line merges into the
       nearer of its neighbors on the outline (Merge at Last). At the front of the left arm, such
       a vertex rises 2 cm over the line with no merge: the outline crosses itself, and the fill
       leaves a hole of 6 edges, or folds a face over a quad of the trunk.
    2. Fill: a 2D Delaunay triangulation (`delaunay_2d_cdt()` of Blender) of the outline of the
       hole, projected on the plane, and of the points of a grid of the side `grid` units inside
       it. The new vertices lie on the plane, and in the plane, a point of the outline over the
       armpit line takes the height of the line. The step stops when the fill adds or merges a
       point of the outline.
    3. Smooth Vertices along the normal of the plane only, `rounds` times with the factor 0.5:
       the new wall, its outline, and `rings` rings of trunk vertices below the armpit line
       move, and the armpit line stays. A vertex of the wall goes at most `deep` units into the
       trunk: the wall sinks where the lips were, but stays over the flat inner side of the arm.
       A move along the plane would drag the vertices across the wall.

    The replays of the other animals that take the steps of this script have no `wall`, and
    this step leaves their meshes as they are. Gives for each side the counts of the lips, of the
    merged vertices, of the new faces, and of the moving vertices, and the largest move in
    units.
    """
    from mathutils.geometry import delaunay_2d_cdt
    from mathutils.kdtree import KDTree
    import numpy as np
    if 'wall' not in s.spec:
        return None
    rule = s.spec['wall']
    mesh = s.mesh
    s.anchor_target = anchor_target(s)
    s.heat_source = mesh.copy()
    s.heat_source.data = mesh.data.copy()
    s.heat_source.name = s.heat_source.data.name = s.animal + '-heat'
    bpy.context.scene.collection.objects.link(s.heat_source)
    s.heat_source.hide_render = True
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(mesh.data)
    part = bm.verts.layers.int['arm_part']
    zone = bm.faces.layers.int['arm_zone']
    tubes = (PART['tube'], PART['tube'] + 10)
    height = s.fr.floor + s.units(s.spec['seam']['armpit'])
    out = {}
    for side, off in ((1, 0), (-1, 10)):
        wall_code, socket = PART['wall'] + off, PART['shoulder'] + off
        plane_co, plane_no = seam_plane(s, side)
        old = [f for f in bm.faces if f[zone] == 3 and f.calc_center_median().x * side > 0
               and not any(p[part] in tubes for p in f.verts)]
        # 1. The lips.
        lips = set()
        stack = [g for f in old for x in f.edges for g in x.link_faces if g[zone] == 0]
        while stack:
            g = stack.pop()
            if (g in lips or g[zone] != 0 or g.normal.dot(plane_no) > rule['lip']
                    or min((p.co - plane_co).dot(plane_no) for p in g.verts) < -s.units(
                        rule['depth'])
                    or any(p[part] in tubes or p[part] == socket
                           or p.co.z > height + s.units(rule['over']) for p in g.verts)):
                continue
            lips.add(g)
            stack += [h for x in g.edges for h in x.link_faces if h not in lips]
        for g in lips:
            for p in g.verts:
                if p[part] == 0:
                    p[part] = wall_code
        old += list(lips)
        border = [x for x in {x for f in old for x in f.edges}
                  if sum(g in old for g in x.link_faces) == 1]
        loop = walk(border)
        bmesh.ops.delete(bm, geom=old, context='FACES')
        # A trunk vertex of the outline over the armpit line merges into the nearer of its two
        # neighbors on the outline (Merge at Last), so that the outline has no spike over the
        # line.
        pit = PART['armpit'] + off
        merged = 0
        for k, p in enumerate(loop):
            if (not p.is_valid or p[part] in (pit, socket)
                    or p.co.z <= height + s.units(0.002)):
                continue
            near = min((q for q in (loop[k - 1], loop[(k + 1) % len(loop)]) if q.is_valid),
                       key=lambda q: (q.co - p.co).length)
            bmesh.ops.pointmerge(bm, verts=[p, near], merge_co=near.co.copy())
            merged += 1
        if merged:
            start = next(p for p in loop if p.is_valid and p[part] == pit)
            loop, prev = [start], None
            while True:
                nxt = next(x.other_vert(loop[-1]) for x in loop[-1].link_edges
                           if x.is_boundary and x.other_vert(loop[-1]) is not prev)
                if nxt is start:
                    break
                prev = loop[-1]
                loop.append(nxt)
        # 2. The fill.
        up = plane_no.cross(Vector((0.0, -1.0, 0.0))).normalized()
        if up.z < 0:
            up = -up
        across = up.cross(plane_no).normalized()
        outline = [((p.co - plane_co).dot(across), (p.co - plane_co).dot(up)) for p in loop]
        top = min(v for (u, v), p in zip(outline, loop) if p[part] == PART['armpit'] + off)
        outline = [(u, v if p[part] == PART['armpit'] + off else min(v, top - 1e-4))
                   for (u, v), p in zip(outline, loop)]
        points = wall_grid(outline, s.units(rule['grid']))
        n = len(outline)
        coords, _, tris, origins, _, _ = delaunay_2d_cdt(
            [Vector(c) for c in outline + points], [(k, (k + 1) % n) for k in range(n)],
            [list(range(n))], 1, 1e-9)
        if any(len(origin) > 1 for origin in origins) or len(coords) != n + len(points):
            raise RuntimeError('The outline of the wall crosses itself in the plane of the seam.')
        verts = {}
        for k, origin in enumerate(origins):
            if origin and origin[0] < n:
                verts[k] = loop[origin[0]]
            else:
                p = bm.verts.new(plane_co + across * coords[k][0] + up * coords[k][1])
                p[part] = wall_code
                verts[k] = p
        faces = []
        for tri in tris:
            f = bm.faces.new([verts[k] for k in tri])
            f[zone] = 3
            f.smooth = True
            f.normal_update()
            if f.normal.dot(plane_no) < 0:
                f.normal_flip()
            faces.append(f)
        # 3. Smooth Vertices along the normal of the plane.
        moving = {p for f in faces for p in f.verts if p[part] == wall_code}
        tree = KDTree(len(moving))
        for k, p in enumerate(moving):
            tree.insert(p.co, k)
        tree.balance()
        ring = set(moving)
        for _ in range(rule['rings']):
            ring = {q for p in ring for x in p.link_edges for q in [x.other_vert(p)]
                    if q[part] == 0 and q not in moving and q.co.z < height
                    and tree.find(q.co)[2] < s.units(rule['reach'])}
            moving |= ring
        moving = sorted(moving, key=lambda p: p.index)
        normal = np.array(plane_no[:])
        start = np.array([p.co[:] for p in moving])
        depth = (start - np.array(plane_co[:])) @ normal
        wall = np.array([p[part] == wall_code for p in moving])
        lift = np.zeros(len(moving))
        for _ in range(rule['rounds']):
            for p, co in zip(moving, start + np.outer(lift, normal)):
                p.co = Vector(co)
            mean = np.array([sum((x.other_vert(p).co for x in p.link_edges), Vector())
                             / len(p.link_edges) for p in moving])
            lift += 0.5 * ((mean - start) @ normal - lift)
            lift = np.where(wall, np.maximum(lift, -s.units(rule['deep']) - depth), lift)
            lift = np.minimum(lift, -depth)
        for p, co in zip(moving, start + np.outer(lift, normal)):
            p.co = Vector(co)
        out[side] = (len(lips), merged, len(faces), len(moving),
                     round(float(np.abs(lift).max() / s.fr.height), 4))
    bmesh.update_edit_mesh(mesh.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    look(s, '6-wall', [mesh], center=(0.1, 0.53, 0.05), scale=0.2)
    return out


def step_inner_color(s):
    """Gives the side walls and the flat inner side of each upper arm one fur color of the trunk.

    No surface of the source lies there, so the bake finds no color. Each corner of these faces
    takes the UV middle of one trunk face beside the side wall: the face whose texture color is
    nearest to the median color of the trunk faces beside the wall.
    """
    import numpy as np
    mesh = s.mesh
    data = mesh.data
    part = [a.value for a in data.attributes['arm_part'].data]
    flat = [a.value for a in data.attributes['arm_flat'].data]
    zone = [a.value for a in data.attributes['arm_zone'].data]
    uv = data.uv_layers.active.data
    bsdf = next(n for n in data.materials[0].node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    image = bsdf.inputs['Base Color'].links[0].from_node.image
    width, height = image.size
    pixels = np.empty(width * height * 4, np.float32)
    image.pixels.foreach_get(pixels)
    pixels = pixels.reshape(height, width, 4)
    walls = {PART['wall'], PART['wall'] + 10}
    beside, inner = [], []
    for poly in data.polygons:
        codes = [part[v] for v in poly.vertices]
        if zone[poly.index] == 3 or (all(flat[v] for v in poly.vertices)
                                     and all(c in (PART['tube'], PART['tube'] + 10)
                                             for c in codes)):
            inner.append(poly)
        elif zone[poly.index] == 0 and any(c in walls for c in codes):
            beside.append(poly)

    def middle(poly):
        return np.mean([uv[li].uv[:] for li in poly.loop_indices], axis=0)

    colors = []
    for poly in beside:
        u, v = middle(poly)
        colors.append(pixels[min(int(v * height), height - 1), min(int(u * width), width - 1), :3])
    colors = np.array(colors)
    median = np.median(colors, axis=0)
    pick = beside[int(np.argmin(np.linalg.norm(colors - median, axis=1)))]
    at = middle(pick)
    for poly in inner:
        for li in poly.loop_indices:
            uv[li].uv = at
    look(s, '7-colors', [mesh])
    return len(inner), [round(float(c), 3) for c in median]


def step_tube_heat(s):
    """Gives the arm vertices the automatic weights of the copy before `step_round_wall()`.

    The copy of `step_round_wall()` is parented to the rig with Automatic Weights as
    `violin_arms.step_bind()` does, and a Data Transfer modifier (vertex groups, nearest vertex)
    copies its weights to the vertices of the tubes and the paws, which lie at the same places.
    Bone heat reads the whole mesh, so the round walls moved the weights of the arm roots, and
    after Limit Total 4 and the Smooth of `step_paint()`, the root rings of both upper arms held
    up to 0.11 more trunk weight and went 0.04 to 0.07 flatter in the play (the flat p5 of
    `pnpm arm-check`). The replays of the other animals have no such copy, and this step leaves
    their weights as they are. Gives the number of arm vertices.
    """
    source = getattr(s, 'heat_source', None)
    if source is None:
        return None
    mesh = s.mesh
    bpy.ops.object.select_all(action='DESELECT')
    source.select_set(True)
    s.rig.select_set(True)
    bpy.context.view_layer.objects.active = s.rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    va.paint_mode(source)
    va.limit_and_normalize()
    bpy.ops.object.mode_set(mode='OBJECT')
    bm = bmesh.new()
    bm.from_mesh(mesh.data)
    layer = bm.verts.layers.int['arm_part']
    island = sorted(p.index for side, off in ((1, 0), (-1, 10))
                    for p in arm_verts(s, bm, layer, off))
    bm.free()
    group = mesh.vertex_groups.new(name='heat')
    group.add(island, 1.0, 'REPLACE')
    bpy.context.view_layer.objects.active = mesh
    mod = mesh.modifiers.new('heat', 'DATA_TRANSFER')
    mod.object = source
    mod.use_vert_data = True
    mod.data_types_verts = {'VGROUP_WEIGHTS'}
    mod.vert_mapping = 'NEAREST'
    mod.layers_vgroup_select_src = 'ALL'
    mod.layers_vgroup_select_dst = 'NAME'
    mod.vertex_group = group.name
    va.apply_modifier(mesh, mod)
    mesh.vertex_groups.remove(mesh.vertex_groups['heat'])
    va.paint_mode(mesh, lambda p: p.index in set(island))
    va.limit_and_normalize()
    bpy.ops.object.mode_set(mode='OBJECT')
    mesh.data.use_paint_mask_vertex = False
    bpy.data.objects.remove(source, do_unlink=True)
    s.heat_source = None
    return len(island)


def step_paint(s):
    """Paints the fixes with the Weight Paint tools, in this order. The places are in the units of
    the studio.

    1. The trunk, the side walls, the socket, and the first `seam.ruled` rings of the shoulder:
       Remove From Group of the arm bones and the clavicles. Then each of these vertices hangs
       only on the bones of `paintedLower`, so `pnpm rig-mesh` gives it the rule weights of the
       config, as on the source mesh: the shoulder turns with the rules of `main`.
    2. The other rings of the tube, and the paw: Remove From Group of the trunk bones and the
       clavicles, so that the arm does not drag on the trunk.
    3. The skin of the armpit: a share of the chest on the tube near the side walls (`anchor()`).
    4. The tube: Smooth, `seam.ramp` times, so that the weights change gradually along the arm.
    """
    mesh, seam = s.mesh, s.spec['seam']
    data = mesh.data
    part = [a.value for a in data.attributes['arm_part'].data]
    ring = [a.value for a in data.attributes['arm_ring'].data]
    bm = bmesh.new()
    bm.from_mesh(data)
    layer = bm.verts.layers.int['arm_part']
    island = {p.index for side, off in ((1, 0), (-1, 10)) for p in arm_verts(s, bm, layer, off)}
    bm.free()
    tubes = (PART['tube'], PART['tube'] + 10)
    ruled = seam['ruled']
    arms = va.arm_groups() + [f'{b}_{side}' for b in ('hand', 'fingers') for side in 'LR']
    clavicles = ['clavicle_L', 'clavicle_R']
    trunk = ['hips', 'spine', 'spine1', 'chest', 'neck', 'head'] + clavicles

    def rules(p):
        return p.index not in island or (part[p.index] in tubes and ring[p.index] < ruled)

    va.paint_mode(mesh, rules)
    va.remove_from(mesh, arms + clavicles)
    bpy.ops.object.mode_set(mode='OBJECT')
    # A vertex that hung only on these bones takes the chest (Assign), so that it has a weight.
    deform = {g.index for g in mesh.vertex_groups if g.name in va.rig_mesh()['BONES']
              or g.name in arms}
    empty = [p.index for p in data.vertices if rules(p)
             and not any(g.group in deform and g.weight > 0 for g in p.groups)]
    mesh.vertex_groups['chest'].add(empty, 1.0, 'REPLACE')
    va.paint_mode(mesh, rules)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='BONE_DEFORM', lock_active=False)
    va.paint_mode(mesh, lambda p: p.index in island and not rules(p))
    va.remove_from(mesh, trunk)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='BONE_DEFORM', lock_active=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    mesh.data.use_paint_mask_vertex = False
    anchored = anchor(s, island)
    va.paint_mode(mesh, lambda p: p.index in island and not rules(p))
    bpy.ops.object.vertex_group_smooth(group_select_mode='BONE_DEFORM', factor=0.5,
                                       repeat=seam['ramp'])
    va.limit_and_normalize()
    bpy.ops.object.mode_set(mode='OBJECT')
    mesh.data.use_paint_mask_vertex = False
    return len(island), anchored


def anchor_target(s):
    """Gives a hidden copy of the faces that `anchor()` measures from: the side walls, and with
    `anchor.crease` also the trunk faces along the seam below each socket. `step_round_wall()`
    takes this copy before it makes the walls again, so that the anchor keeps the distances of the
    seam fill."""
    mesh, rule = s.mesh, s.spec['anchor']
    wall = mesh.copy()
    wall.data = mesh.data.copy()
    wall.name = wall.data.name = s.animal + '-walls'
    bpy.context.scene.collection.objects.link(wall)
    for g in list(wall.vertex_groups):
        wall.vertex_groups.remove(g)
    for m in list(wall.modifiers):
        wall.modifiers.remove(m)
    wall.parent = None
    bm = bmesh.new()
    bm.from_mesh(wall.data)
    zone = bm.faces.layers.int['arm_zone']
    part_t = bm.verts.layers.int['arm_part']
    walls = {PART['wall'], PART['wall'] + 10}

    def target(f):
        # The side wall, and with `crease` also the trunk faces along the seam below the socket.
        return f[zone] == 3 or (rule['crease'] and any(p[part_t] in walls for p in f.verts))
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not target(f)], context='FACES')
    bm.to_mesh(wall.data)
    bm.free()
    wall.hide_render = True
    return wall


def anchor(s, island):
    """Gives the tube vertices near each side wall a share of the chest weight (fix 5).

    The upper arm of the source mesh lies against the trunk down to the elbow, so a turn of the arm
    toward the trunk takes the inner side and the back of the tube into the trunk. A Vertex Weight
    Proximity modifier gives each tube vertex a weight by its distance to the side walls: `share`
    on the wall, falling to 0 at the distance `reach` (units). A Vertex Weight Mix modifier adds it
    to the chest, and Normalize All takes it from the arm bones. Thus the skin of the armpit
    follows the trunk in part, as a real armpit does. With `rings`, only the tube vertices of the
    first `rings` rings take the share: on the short arm of the hippo, the forearm lies within
    `reach` of the side wall too.
    """
    mesh, rule = s.mesh, s.spec['anchor']
    if rule['share'] <= 0:
        return 0
    wall = getattr(s, 'anchor_target', None) or anchor_target(s)
    wall.matrix_world = mesh.matrix_world
    part = [a.value for a in mesh.data.attributes['arm_part'].data]
    ring = [a.value for a in mesh.data.attributes['arm_ring'].data]
    tubes = (PART['tube'], PART['tube'] + 10)
    rings = rule.get('rings', len(s.axes[1]))
    tube = [i for i in island if part[i] in tubes and ring[i] < rings]
    group = mesh.vertex_groups.new(name='anchor')
    group.add(tube, 1.0, 'REPLACE')
    bpy.context.view_layer.objects.active = mesh
    mod = mesh.modifiers.new('anchor', 'VERTEX_WEIGHT_PROXIMITY')
    mod.vertex_group = 'anchor'
    mod.target = wall
    mod.proximity_mode = 'GEOMETRY'
    mod.proximity_geometry = {'FACE'}
    mod.min_dist = s.units(rule['reach'])
    mod.max_dist = 0.0
    mod.falloff_type = 'SMOOTH'
    va.apply_modifier(mesh, mod)
    mix = mesh.modifiers.new('anchor-mix', 'VERTEX_WEIGHT_MIX')
    mix.vertex_group_a = 'chest'
    mix.vertex_group_b = 'anchor'
    mix.mix_mode = 'ADD'
    mix.mix_set = 'B'
    mix.mask_constant = rule['share']
    va.apply_modifier(mesh, mix)
    mesh.vertex_groups.remove(mesh.vertex_groups['anchor'])
    bpy.data.objects.remove(wall, do_unlink=True)
    va.paint_mode(mesh, lambda p: p.index in island)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='BONE_DEFORM', lock_active=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    mesh.data.use_paint_mask_vertex = False
    return len(tube)


def step_weights(s):
    """Writes the weights for `paintedWeights` of the config (`violin_arms.step_weights()`). With
    `--views`, it also writes the part codes of each vertex (`cat-parts.json`) for the probes."""
    if VIEWS is not None:
        import json
        data = s.mesh.data
        parts = {name: [a.value for a in data.attributes[name].data]
                 for name in ('arm_part', 'arm_flat', 'arm_ring')}
        with open(os.path.join(VIEWS, 'cat-parts.json'), 'w') as f:
            json.dump(parts, f)
    return va.step_weights(s)


STEPS = (va.import_mesh, step_cut, step_wall, step_tube, step_wrap, step_bridge, step_beautify,
         step_uv, step_bake, va.step_normals, step_shape, step_belly, step_round_wall,
         step_clean_pit, va.step_atlas, step_inner_color, va.step_export, va.step_skeleton,
         va.step_bind, step_tube_heat, step_paint, step_weights)

