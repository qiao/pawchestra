# Output: `assets/models/dog/dog-patch.glb`.
"""Remodels the inner side of each arm of a copy of a mesh, in Blender (batch).

It reads the bones of a tail of two bones and of a jaw from the config, as `main()` of
`tools/blender/rig_mesh.py` does, so that it runs on the dog, and `cut.top` comes from the config
that it gets.

The arm of the source joins the side of the trunk from the shoulder down to near the elbow. A cut
of the rig (`cut_seam()` of `tools/blender/rig_mesh.py`) closes the arm there with one flat
polygon, which shows as a flat dark sheet behind the raised arm. For each side, this script:

1. removes the faces that join the arm to the trunk, with the rule of the cut: each face below the
   height `cut.top` with a corner in the free arm and a corner outside it;
2. closes the arm with a round patch over the arm run of the hole: a grid of new vertices in the
   chart of the arm (the place along the arm and the angle around the bone axis), a constrained
   Delaunay triangulation, and rounds of relaxation that move each new vertex to the mean of its
   neighbors and then out to a circle fitted to the arm at its place (`OPTIONS`);
3. leaves the hole of the trunk open. The cut of the rig closes it with the caps of the body and
   the quad at the top.

    blender -b --factory-startup --python <this file> -- <config.json> <in.glb> <out.glb> \
        [<options JSON>]

The deer copy: `tools/mesh-rigs/deer.json`, `assets/models/deer/deer.glb`, and the options
`{"step":0.025,"freeR":false,"fade":[0.35,0.65]}`. The points are in the units of the rig config:
1 unit from the soles to the top, soles at y = 0, y up, +z forward, +x the left side.
"""
import json
import math
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt

#: The options of the copy `rabbit-4-elbows.glb` (variant e7 of the report):
#:
#: - `step`, `margin`, `chart`: the step of the rings of new vertices in the chart (units), the
#:   least gap of a new vertex from the run (a part of the step), and the radius that turns the
#:   angle of the chart into a length.
#: - `fade`: the places along the arm (upper arm lengths from the shoulder joint) from which the
#:   push to the round target grows from none to all. Above them, the patch only relaxes.
#: - `rounds`, `share`: the rounds of relaxation, and the share of each move to the mean of the
#:   neighbors.
#: - `target`: `circle` (a circle around `center` with the radius times `scale`) or `ellipse` (a
#:   half ellipse on the chord of the hole with the depth of the outer side times `depth`).
#: - `center`: `fit` (a circle fitted to the arm at each place), `axis` (the bone axis with the
#:   median radius of the arm, times `scaleAxis`), or `blend` (`axis` above `blend[0]`, `fit` below
#:   `blend[1]`).
#: - `free`, `freeFrom`, `pins`: the run vertices from the place `freeFrom` down, except the two
#:   ends and `pins`, relax with the patch.
#: - `gridFrom`: no new vertex above this place.
#:
#: A key with the side at its end, such as `freeR`, holds for that side only. The right arm has a
#: free run: vertex 1015 of its back run lies 1.5 cm from the bone axis, and with a fixed run the
#: patch showed a valley beside a ridge. The free run made the left elbow flatter (above 0.71).
OPTIONS = {
    'step': 0.015,
    'margin': 0.55,
    'chart': 0.04,
    'fade': [0.55, 0.85],
    'rounds': 40,
    'share': 0.5,
    'target': 'circle',
    'scale': 0.85,
    'depth': 1.0,
    'center': 'fit',
    'blend': [0.75, 0.95],
    'scaleAxis': 1.0,
    'free': False,
    'freeR': True,
    'freeFrom': 0.0,
    'pins': [],
    'gridFrom': 0.0,
}


def rig_functions():
    """Gives the functions of the rig script, with no run of its main function."""
    text = open('tools/blender/rig_mesh.py').read().rsplit('\nmain()', 1)[0]
    space = {'__name__': 'rig_mesh'}
    exec(compile(text, 'rig_mesh.py', 'exec'), space)
    cfg = json.load(open(CONFIG_PATH[0]))
    for extra in (space['TAIL_TIP'], space['JAW']):
        if extra in cfg['joints']:
            space['BONES'] = space['BONES'] + (extra,)
    return space


def arm_path(config, sign):
    """Gives the shoulder, elbow, and wrist joints of a side, and the upper arm length."""
    joints = config['joints']
    s = np.array(joints['upper_arm_L']['head']) * [sign, 1, 1]
    e = np.array(joints['forearm_L']['head']) * [sign, 1, 1]
    w = np.array(joints['hand_L']['head']) * [sign, 1, 1]
    return s, e, w, float(np.linalg.norm(e - s))


def chart(p, path, sign):
    """Gives the place u of a point along the arm (upper arm lengths from the shoulder joint, past
    1 on the forearm), the angle around the axis in degrees (0 out from the body, 180 toward the
    trunk, 90 forward), the point of the axis at u, the unit axis, and the two unit directions
    of the angle 0 and 90."""
    s, e, w, length = path
    ua = (e - s) / length
    fa = (w - e) / np.linalg.norm(w - e)
    if (p - e) @ (ua + fa) > 0:
        u = 1.0 + (p - e) @ fa / length
        c, ax = e + (u - 1.0) * length * fa, fa
    else:
        u = (p - s) @ ua / length
        c, ax = s + u * length * ua, ua
    out = np.array([sign, 0.0, 0.0])
    e1 = out - ax * (out @ ax)
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(ax, e1) * sign
    if e2[2] < 0:
        e2 = -e2
    r = p - c
    angle = math.degrees(math.atan2(r @ e2, r @ e1)) % 360.0
    return u, angle, c, ax, e1, e2


def inside_polygon(q, poly):
    """Tells if a 2D point lies inside a polygon, by the crossing count."""
    hit = False
    n = len(poly)
    for k in range(n):
        a, b = poly[k], poly[(k + 1) % n]
        if (a[1] > q[1]) != (b[1] > q[1]):
            x = a[0] + (q[1] - a[1]) * (b[0] - a[0]) / (b[1] - a[1])
            if x > q[0]:
                hit = not hit
    return hit


def gap_to_polygon(q, poly):
    """Gives the distance of a 2D point from the edges of a polygon."""
    best = math.inf
    n = len(poly)
    for k in range(n):
        a, b = np.asarray(poly[k]), np.asarray(poly[(k + 1) % n])
        t = np.clip((q - a) @ (b - a) / max((b - a) @ (b - a), 1e-12), 0.0, 1.0)
        best = min(best, float(np.linalg.norm(q - (a + t * (b - a)))))
    return best


def remodel_side(bm, rig, config, pts, side, sign, opts):
    """Removes the joining faces of one side and closes the arm with a round patch. Gives a report
    line. An option with the name of the side at its end, such as `scaleR`, holds for that side
    only."""
    opts = {**opts, **{k[:-1]: v for k, v in opts.items() if k.endswith(side) and k[:-1] in opts}}
    rules = config['weights']
    heads, ends, _, _ = rig['joints_of'](config)
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    tris = np.array([[v.index for v in f.verts] for f in bm.faces], np.int64)
    # The masks use the places of the rig, after the smoothing of the neck (`smooth`).
    shaped = rig['smooth_box'](pts, tris, config['smooth'])[0] if 'smooth' in config else pts
    arm = rig['free_arm'](shaped, tris, rules, heads, ends, sign)
    top = config['cut']['top']
    mixed = [k for k, t in enumerate(tris)
             if arm[t].any() and (~arm[t]).any() and (shaped[t, 0] * sign > 0).all()
             and shaped[t, 1].max() < top]
    loop = rig['cut_loop'](tris, mixed)
    start = next(k for k in range(len(loop)) if arm[loop[k]] and not arm[loop[k - 1]])
    loop = loop[start:] + loop[:start]
    count = int(arm[loop].sum())
    run = loop[:count]
    path = arm_path(config, sign)

    # The round target along the arm: a circle fitted to the points where the edges of the free
    # arm cross the plane across the axis at each place. The center of the arm lies inward of the
    # bone axis. The arm has too few vertices near each place for a fit of the vertices.
    frames = [chart(p, path, sign) for p in pts]
    places = np.array([f[:2] for f in frames])
    stations = np.arange(0.3, 1.61, 0.05)
    s0, e0, w0, length = path
    edges = {tuple(sorted((int(t[i]), int(t[(i + 1) % 3])))) for t in tris if arm[t].all()
             for i in range(3)}
    edges = np.array(sorted(edges))
    fits, medians = [], []
    for u in stations:
        c = (s0 + u * length * (e0 - s0) / length if u <= 1.0
             else e0 + (u - 1.0) * length * (w0 - e0) / np.linalg.norm(w0 - e0))
        _, _, c, ax, e1, e2 = chart(c + 0.01 * np.array([sign, 0, 0]), path, sign)
        d = (pts - c) @ ax
        da, db = d[edges[:, 0]], d[edges[:, 1]]
        cross = edges[da * db < 0]
        t = (d[cross[:, 0]] / (d[cross[:, 0]] - d[cross[:, 1]]))[:, None]
        q = pts[cross[:, 0]] + t * (pts[cross[:, 1]] - pts[cross[:, 0]]) - c
        q = q[np.linalg.norm(q, axis=1) < 0.09]
        q = np.c_[q @ e1, q @ e2]
        if len(q) < 5:
            fits.append([np.nan] * 3)
            medians.append([np.nan] * 3)
            continue
        medians.append([0.0, 0.0, float(np.median(np.linalg.norm(q, axis=1)))])
        m = np.c_[2 * q, np.ones(len(q))]
        cx, cy, k = np.linalg.lstsq(m, (q ** 2).sum(axis=1), rcond=None)[0]
        fits.append([cx, cy, math.sqrt(max(k + cx * cx + cy * cy, 0.0))])

    def filled(rows):
        """Fills the places with no fit from their neighbors."""
        rows = np.array(rows)
        good = ~np.isnan(rows[:, 0])
        return np.array([np.interp(stations, stations[good], rows[good, i]) for i in range(3)]).T

    fits, medians = filled(fits), filled(medians)
    fits[:, 2] *= opts['scale']
    medians[:, 2] *= opts['scaleAxis']
    # The target is the circle around the bone axis with the median radius of the arm near the
    # top of the hole, and the fitted circle at the elbow (`center`: `axis`, `fit`, or `blend`
    # from the first place of `blend` to the second).
    if opts['center'] == 'axis':
        fits = medians
    elif opts['center'] == 'blend':
        lo_b, hi_b = opts['blend']
        t = np.clip((stations - lo_b) / (hi_b - lo_b), 0.0, 1.0)
        t = (t * t * (3 - 2 * t))[:, None]
        fits = medians * (1 - t) + fits * t

    def target_at(u):
        """Gives the center (in the frame of the place) and the radius of the round target."""
        cx, cy, r = (float(np.interp(u, stations, fits[:, i])) for i in range(3))
        return np.array([cx, cy]), r

    # The chart of the run: the place along the arm and the angle as lengths.
    ref = opts['chart']
    flat = [np.array([places[v, 0] * length, math.radians(places[v, 1]) * ref]) for v in run]
    area = sum(flat[k][0] * flat[(k + 1) % len(flat)][1] - flat[(k + 1) % len(flat)][0] * flat[k][1]
               for k in range(len(flat)))
    order = list(range(len(run))) if area > 0 else list(reversed(range(len(run))))
    poly = [flat[k] for k in order]
    step = opts['step']
    lo = np.min(poly, axis=0)
    hi = np.max(poly, axis=0)
    inner = []
    for a in np.arange(lo[0] + step / 2, hi[0], step):
        for b in np.arange(lo[1] + step / 2, hi[1], step):
            q = np.array([a, b])
            if (a / length >= opts['gridFrom'] and inside_polygon(q, poly)
                    and gap_to_polygon(q, poly) > opts['margin'] * step):
                inner.append(q)
    coords = [Vector(p.tolist()) for p in poly] + [Vector(q.tolist()) for q in inner]
    n = len(poly)
    out_verts, _, out_faces, orig_verts, _, _ = delaunay_2d_cdt(
        coords, [], [list(range(n))], 1, 1e-9)
    index = []
    for k, orig in enumerate(orig_verts):
        if not orig:
            raise RuntimeError(f'side {side}: the triangulation adds a vertex at {out_verts[k]}')
        index.append(orig[0])

    # The new vertices start on the round target, and the relaxation then smooths them.
    made = {}
    for j, q in enumerate(inner):
        u = q[0] / length
        angle = q[1] / ref
        s, e, w, _ = path
        ua = (e - s) / length
        fa = (w - e) / np.linalg.norm(w - e)
        c = s + u * length * ua if u <= 1.0 else e + (u - 1.0) * length * fa
        _, _, _, ax, e1, e2 = chart(c + 0.01 * np.array([sign, 0, 0]), path, sign)
        center, radius = target_at(u)
        p = c + center[0] * e1 + center[1] * e2 + radius * (math.cos(angle) * e1
                                                             + math.sin(angle) * e2)
        made[n + j] = p
    vert_of = {}
    for k in range(n):
        vert_of[k] = bm.verts[run[order[k]]]
    # The faces of the patch, in the winding of the chart.
    faces = [[index[i] for i in f] for f in out_faces]

    # The UV of each new face: the mean UV of the nearest face of the outer arm at the run, so
    # that the patch takes the fur of the arm.
    uv = bm.loops.layers.uv.active
    run_set = {bm.verts[v] for v in run}
    removed = {bm.faces[k] for k in mixed}
    outside = [f for v in run_set for f in v.link_faces if f not in removed
               and all(arm[w.index] for w in f.verts)]
    outside = list(dict.fromkeys(outside))
    plain = {f: sum((loop[uv].uv for loop in f.loops), Vector((0.0, 0.0))) / 3 for f in outside}
    middles = {f: np.mean([pts[w.index] for w in f.verts], axis=0) for f in outside}

    # The winding: a run edge of the patch runs against the same edge of the kept arm face.
    a, b = vert_of[0], vert_of[1]
    kept_face = next(f for f in a.link_faces if f not in removed and b in f.verts)
    ka = [loop.vert for loop in kept_face.loops]
    kept_dir = ka[(ka.index(a) + 1) % 3] is b
    patch_dir = None
    for f in faces:
        if 0 in f and 1 in f:
            patch_dir = f[(f.index(0) + 1) % 3] == 1
    flip = patch_dir == kept_dir

    bmesh.ops.delete(bm, geom=list(removed), context='FACES_ONLY')
    for j in made:
        vert_of[j] = bm.verts.new(Vector((0.0, 0.0, 0.0)))
    new_faces = []
    for f in faces:
        vs = [vert_of[i] for i in (reversed(f) if flip else f)]
        new_faces.append(bm.faces.new(vs))
    places_of = dict(made)
    for k in range(n):
        places_of[k] = pts[run[order[k]]]
    # The run vertices between the two ends may move too (`free`): the source run has dents, such
    # as vertex 1015 of the right arm 1.5 cm from the bone axis, and the patch then shows a
    # valley beside a ridge. A free run vertex relaxes toward all its neighbors.
    key_of = {vert_of[k]: k for k in vert_of}
    neighbors = {j: set() for j in made}
    for f in faces:
        for i in f:
            if i in neighbors:
                neighbors[i] |= set(f) - {i}
    ends = {run[0], run[-1]} | set(opts['pins'])
    if opts['free']:
        for k in range(n):
            v = vert_of[k]
            if v.index in ends or places[v.index, 0] < opts['freeFrom']:
                continue
            ring = set()
            for e in v.link_edges:
                w = e.other_vert(v)
                if w in key_of:
                    ring.add(key_of[w])
                else:
                    key = ('old', w.index)
                    places_of[key] = pts[w.index]
                    ring.add(key)
            neighbors[k] = ring
    low, high = opts['fade']
    ring = [places_of[k] for k in range(n)]

    def crossings(points, pairs, c, ax):
        """Gives the points where the segments of `pairs` cross the plane through c across ax."""
        d = (points - c) @ ax
        da, db = d[pairs[:, 0]], d[pairs[:, 1]]
        hit = pairs[da * db < 0]
        t = (d[hit[:, 0]] / (d[hit[:, 0]] - d[hit[:, 1]]))[:, None]
        return points[hit[:, 0]] + t * (points[hit[:, 1]] - points[hit[:, 0]])

    ring_points = np.array(ring)
    ring_pairs = np.array([[k, (k + 1) % n] for k in range(n)])

    def ellipse_push(p, u, c, ax):
        """Gives the move of a new vertex toward the half ellipse on the chord of the hole at its
        place: the depth of the outer side of the arm from the chord, times `depth`, at the middle
        of the chord, and 0 at its ends. Gives 0 where the plane does not cross the hole twice."""
        ends = crossings(ring_points, ring_pairs, c, ax)
        if len(ends) < 2:
            return np.zeros(3)
        gaps = np.linalg.norm(ends[:, None] - ends[None], axis=2)
        i, k = np.unravel_index(np.argmax(gaps), gaps.shape)
        a_end, b_end = ends[i], ends[k]
        mid = (a_end + b_end) / 2
        half = np.linalg.norm(b_end - a_end) / 2
        along = (b_end - a_end) / (2 * half)
        outer = crossings(pts, edges, c, ax)
        outer = outer[np.linalg.norm(outer - mid, axis=1) < 0.09]
        if len(outer) < 3 or half < 1e-6:
            return np.zeros(3)
        normal = np.cross(ax, along)
        if ((outer - mid) @ normal).mean() > 0:
            normal = -normal
        depth = float(np.max((outer - mid) @ -normal))
        x = float((p - mid) @ along) / half
        want = opts['depth'] * depth * math.sqrt(max(0.0, 1.0 - x * x))
        return (want - float((p - mid) @ normal)) * normal

    for _ in range(opts['rounds']):
        means = {j: np.mean([places_of[i] for i in neighbors[j]], axis=0) for j in neighbors}
        for j, m in means.items():
            p = places_of[j] + opts['share'] * (m - places_of[j])
            u, _, c, ax, e1, e2 = chart(p, path, sign)
            t = min(max((u - low) / (high - low), 0.0), 1.0)
            push = t * t * (3 - 2 * t)
            if opts['target'] == 'ellipse':
                p = p + push * ellipse_push(p, u, c, ax)
            else:
                center, radius = target_at(u)
                mid = c + center[0] * e1 + center[1] * e2
                radial = (p - mid) - ax * ((p - mid) @ ax)
                r = float(np.linalg.norm(radial))
                if r > 1e-9:
                    p = p + push * (radius - r) * radial / r
            places_of[j] = p
    for j in neighbors:
        vert_of[j].co = Vector(to_blender_point(places_of[j]))
    moved = [float(np.linalg.norm(places_of[k] - pts[run[order[k]]])) for k in range(n)]
    for f in new_faces:
        mid = np.mean([places_of_vertex(v, vert_of, places_of) for v in f.verts], axis=0)
        source = min(outside, key=lambda g: float(np.linalg.norm(middles[g] - mid)))
        for loop in f.loops:
            loop[uv].uv = plain[source]
    rs = [float(np.linalg.norm((places_of[j] - chart(places_of[j], path, sign)[2])))
          for j in made]
    fit = [target_at(u) for u in (0.6, 0.9, 1.2)]
    return (f'side {side}: {len(mixed)} joining faces go, the arm run {run}, '
            f'{len(made)} new vertices, {len(new_faces)} patch faces (the flat cap had '
            f'{len(run) - 2}), target radius '
            f'{" / ".join(f"{r:.4f}" for _, r in fit)} u and center '
            f'{" / ".join(str(np.round(c, 4).tolist()) for c, _ in fit)} at u 0.6 / 0.9 / 1.2, '
            f'new vertex distance from the axis {min(rs):.4f} to {max(rs):.4f} u, the largest '
            f'move of a run vertex {max(moved):.4f} u')


CONFIG_PATH = [None]

#: The map from rig units to Blender coordinates of the current mesh, set by `run()`.
FRAME = {}


def to_blender_point(p):
    """Gives a point in rig units in the Blender coordinates of the mesh."""
    s, floor = FRAME['scale'], FRAME['floor']
    return (p[0] / s, -p[2] / s, p[1] / s + floor)


def places_of_vertex(v, vert_of, places_of):
    """Gives the rig place of a vertex of a patch face."""
    for k, w in vert_of.items():
        if w is v:
            return places_of[k]
    raise KeyError(v)


def run(config_path, source, out, opts=None):
    """Imports the source, remodels both arms, and exports the copy. Gives the report lines."""
    opts = {**OPTIONS, **(opts or {})}
    CONFIG_PATH[0] = config_path
    config = json.load(open(config_path))
    rig = rig_functions()
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=source)
    ob = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
    mw = ob.matrix_world.copy()
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.transform(mw)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=config['weld'])
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    lines = [f'source: {len(bm.verts)} vertices, {len(bm.faces)} triangles']
    zs = [v.co.z for v in bm.verts]
    FRAME['floor'] = min(zs)
    FRAME['scale'] = 1.0 / (max(zs) - min(zs))
    for side, sign in (('L', 1.0), ('R', -1.0)):
        bm.verts.ensure_lookup_table()
        s, floor = FRAME['scale'], FRAME['floor']
        pts = np.array([[v.co.x * s, (v.co.z - floor) * s, -v.co.y * s] for v in bm.verts])
        lines.append(remodel_side(bm, rig, config, pts, side, sign, opts))
        bm.verts.index_update()
        bm.faces.index_update()
    lines.append(f'copy: {len(bm.verts)} vertices, {len(bm.faces)} triangles, '
                 f'{sum(1 for e in bm.edges if e.is_boundary)} open edges')
    bm.transform(mw.inverted())
    bm.to_mesh(ob.data)
    bm.free()
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True)
    return lines


if __name__ == '__main__' and '--' in sys.argv:
    argv = sys.argv[sys.argv.index('--') + 1:]
    print('\n'.join(run(argv[0], argv[1], argv[2],
                        opts=json.loads(argv[3]) if len(argv) > 3 else None)))
