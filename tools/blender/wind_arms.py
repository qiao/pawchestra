"""The shared steps of a Blender session that rebuilds the arms of a wind player.

The rebuild uses loop edges, retopology, and extra bones to fix the arm and wrist twist.
`arm_rebuild.py` runs these steps between the steps of `violin_arms.py`. They change the steps of
`violin_arms.py` in these ways:

- The rings of the elbow and of the wrist can have their own gaps (`arm_stations()`,
  `step_cut_and_tube()`).
- Collapse Edges removes the thin faces that the Bisect and the bridge leave at each cut loop
  (`step_clean_cut()`, `step_clean_bridge()`).
- The skeleton takes the joints in the units of the source, and each wrist helper can span twice
  `wristGap` (`step_skeleton()`).
- Each point of the weights file is in the units of the rig config (`config_points()`,
  `step_weights()`).

A config can scale the source (`proportions`) in `load_mesh()` of `rig_mesh.py`. Then its
joints are in the units of the scaled source. The session works in the units of the source:
`source_units()` gives the arm joints there, and `step_weights()` writes each point in the units
of the scaled source, as `rig_mesh.py` reads it.
"""

import importlib.util
import json
import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))


def load_violin_arms():
    """Loads `violin_arms.py` from the folder of this script as the module `violin_arms`."""
    if 'violin_arms' in sys.modules:
        return sys.modules['violin_arms']
    path = os.path.join(HERE, 'violin_arms.py')
    spec = importlib.util.spec_from_file_location('violin_arms', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    sys.modules['violin_arms'] = module
    return module


va = load_violin_arms()

_QUIET = {}


def quiet_rig_mesh():
    """Gives the functions of `rig_mesh.py` one time, with no log lines."""
    if not _QUIET:
        names = va.rig_mesh()
        # The functions of `rig_mesh.py` read `log` from this namespace.
        names['log'] = lambda *args: None
        _QUIET['names'] = names
    return _QUIET['names']


def source_point(point, rule):
    """Gives a point of the scaled source (`proportions` of a config) in the units of the source.
    Below the blend of the kept head, each factor of the rule divides its axis. In the blend and
    the head, a few rounds of Newton steps with the factors as the slope undo `proportioned()` of
    `rig_mesh.py`."""
    import numpy as np

    rm = quiet_rig_mesh()
    factors = rm['proportion_factors'](rule)
    target = np.asarray(point, float)
    guess = target / factors
    for _ in range(20):
        guess = guess + (target - rm['proportioned'](guess[None, :], rule)[0]) / factors
    return [float(v) for v in guess]


def source_units(joints, rule):
    """Gives the joints of a config with `proportions` in the units of the source
    (`source_point()`)."""
    out = {}
    for name, spec in joints.items():
        out[name] = dict(spec)
        for key in ('head', 'tail'):
            if isinstance(spec.get(key), list):
                out[name][key] = source_point(spec[key], rule)
    return out


def arm_stations(s, line):
    """Gives the center line point and the axis of each ring, as `arm_stations()` of
    `violin_arms.py` does, with the gap `wristGap` of the animal at the wrist: the rings of the
    elbow stand `gap` from the joint, and the last forearm ring `wristGap` from the wrist. `fore`
    is the number of the inner forearm rings at equal steps, or a tuple of their shares of the
    forearm from the elbow joint."""
    a, e, w, t = line
    gap = s.units(s.spec['gap'])
    wrist = s.units(s.spec.get('wristGap', s.spec['gap']))
    u, f, h = (e - a).normalized(), (w - e).normalized(), (t - w).normalized()
    out = [(a.lerp(e, k), u) for k in tuple(s.spec['upper']) + (1 - gap / (e - a).length,)]
    out.append((e, (u + f).normalized()))
    lo, hi = gap / (w - e).length, 1 - wrist / (w - e).length
    count = s.spec['fore']
    if isinstance(count, (tuple, list)):
        shares = (lo,) + tuple(count) + (hi,)
    else:
        shares = tuple(lo + (hi - lo) * k / (count + 1) for k in range(count + 2))
    out += [(e.lerp(w, k), f) for k in shares]
    out.append((w, (f + h).normalized()))
    return out


def step_cut_and_tube(s):
    """Cuts both arms and models both tubes, as `step_cut_and_tube()` of `violin_arms.py` does,
    with the rings of `arm_stations()` above."""
    stations = va.arm_stations
    va.arm_stations = arm_stations
    try:
        return va.step_cut_and_tube(s)
    finally:
        va.arm_stations = stations


def step_skeleton(s):
    """Adds the studio skeleton as `step_skeleton()` of `violin_arms.py` does. With `proportions`
    in the config, the bones take the joints in the units of the source (`source_units()`), so
    that they lie in the mesh of the session, which has the longer arms of `step_shape()`. With a
    `wristGap` of the animal, each wrist helper spans twice that gap, centered on the wrist joint,
    so that the bone heat gives it the rings of the wrist. The length of a helper does not change
    the skin of the app, which turns each helper around its joint."""
    rule = s.config.get('proportions')
    joints = s.config['joints']
    if rule:
        s.config['joints'] = source_units(joints, rule)
    try:
        rig = va.step_skeleton(s)
    finally:
        s.config['joints'] = joints
    if 'wristGap' in s.spec:
        bpy.context.view_layer.objects.active = rig
        bpy.ops.object.mode_set(mode='EDIT')
        for side in 'LR':
            bone = rig.data.edit_bones[f'wrist_{side}']
            middle = (bone.head + bone.tail) / 2
            half = (bone.tail - bone.head).normalized() * s.units(s.spec['wristGap'])
            bone.head, bone.tail = middle - half, middle + half
        bpy.ops.object.mode_set(mode='OBJECT')
    return rig


#: The smallest corner angle, in degrees, of a face at a cut loop after `step_clean_cut()`.
CUT_ANGLE = 12.0


def step_clean_cut(s):
    """Collapses the thin faces at the cut loops (Collapse Edges), after the cuts and before the
    wrap.

    The Bisect of a cut splits each face that the plane crosses. When the plane passes near a
    corner or nearly along an edge, it leaves a thin face with a corner of a few degrees at the
    loop. On the mouse, such faces at the shoulder line folded in each rest and play sample. While
    a face at a loop has a corner below `CUT_ANGLE`, its shortest edge with a loop vertex collapses
    to its middle, and the merged vertex stays a vertex of the loop. Gives the number of collapsed
    edges.
    """
    import bmesh

    mesh = s.mesh
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(mesh.data)
    part = bm.verts.layers.int['arm_part']
    loops = {va.PART[c] + off for c in ('shoulder', 'wrist') for off in (0, 10)}
    count = 0
    for _ in range(200):
        thin = None
        for f in bm.faces:
            if not any(p[part] in loops for p in f.verts):
                continue
            if min(math.degrees(c.calc_angle()) for c in f.loops) < CUT_ANGLE:
                thin = f
                break
        if thin is None:
            break
        edge = min((e for e in thin.edges if any(p[part] in loops for p in e.verts)),
                   key=lambda e: e.calc_length())
        code = max(p[part] for p in edge.verts)
        bmesh.ops.collapse(bm, edges=[edge], uvs=True)
        count += 1
        for p in bm.verts:
            if p.is_valid and p[part] == 0 and any(q[part] == code for q in
                                                   (e.other_vert(p) for e in p.link_edges)) \
                    and p.is_boundary:
                p[part] = code
    bmesh.update_edit_mesh(mesh.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    return count


def step_clean_bridge(s):
    """Collapses the thin bridge triangles (Collapse Edges), after Beautify Faces.

    A cut loop has more vertices than the ring of 16 that it bridges to, so some bridge triangles
    have two loop vertices close together and a corner below `CUT_ANGLE`. Their edge along the
    loop collapses to its middle. Gives the number of collapsed edges.
    """
    import bmesh

    mesh = s.mesh
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(mesh.data)
    part = bm.verts.layers.int['arm_part']
    loops = {va.PART[c] + off for c in ('shoulder', 'wrist') for off in (0, 10)}
    tubes = {va.PART['tube'], va.PART['tube'] + 10}
    count = 0
    for _ in range(200):
        thin = None
        for f in bm.faces:
            codes = [p[part] for p in f.verts]
            if (sum(c in loops for c in codes) == 2 and any(c in tubes for c in codes)
                    and min(math.degrees(c.calc_angle()) for c in f.loops) < CUT_ANGLE):
                thin = f
                break
        if thin is None:
            break
        edge = next(e for e in thin.edges if all(p[part] in loops for p in e.verts))
        bmesh.ops.collapse(bm, edges=[edge], uvs=True)
        count += 1
    for f in bm.faces:
        f.smooth = True
    bmesh.update_edit_mesh(mesh.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    return count


def config_points(s, coords):
    """Gives the places of the vertices in the units of the rig config: the units of the studio,
    then the `soften` and the `proportions` of `load_mesh()` of `rig_mesh.py`, on the triangles of
    the exported source."""
    import numpy as np

    rm = va.rig_mesh()
    fr = s.fr
    points = rm['from_blender'](np.array(coords))
    points = (points - [0.0, fr.floor, 0.0]) / fr.height
    config = s.config
    if 'soften' not in config and 'proportions' not in config:
        return points
    path = os.path.join(s.out_dir, s.animal + '-arms.glb')
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    ob = next(o for o in bpy.data.objects if o not in before and o.type == 'MESH')
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.transform(ob.matrix_world)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=config['weld'])
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.verts.ensure_lookup_table()
    raw = rm['from_blender'](np.array([p.co[:] for p in bm.verts]))
    tris = np.array([[p.index for p in f.verts] for f in bm.faces], np.int64)
    bm.free()
    for o in set(bpy.data.objects) - before:
        bpy.data.objects.remove(o, do_unlink=True)
    floor, top = raw[:, 1].min(), raw[:, 1].max()
    raw = (raw - [0.0, floor, 0.0]) / (top - floor)
    moved = raw
    if 'soften' in config:
        moved = rm['softened'](moved, tris, config['soften'])
    if 'proportions' in config:
        moved = rm['proportioned'](moved, config['proportions'])
    # Each session vertex takes the move of the exported vertex at its place.
    out = np.empty_like(points)
    for i, p in enumerate(points):
        gaps = np.linalg.norm(raw - p, axis=1)
        k = int(np.argmin(gaps))
        if gaps[k] > 1e-5:
            raise RuntimeError('No exported vertex at the session vertex %d (%.6f u).'
                               % (i, gaps[k]))
        out[i] = moved[k]
    return out


def step_weights(s):
    """Writes the weights for `paintedWeights` of the config: the deform bones, the place of each
    vertex in the units of the rig config (`config_points()`), and its weights."""
    mesh, rig = s.mesh, s.rig
    bones = [b.name for b in rig.data.bones if b.use_deform]
    names = {g.index: g.name for g in mesh.vertex_groups}
    rows = []
    for vert in mesh.data.vertices:
        w = {names[g.group]: g.weight for g in vert.groups if g.weight > 0}
        rows.append([round(w.get(b, 0.0), 6) for b in bones])
    points = config_points(s, [p.co[:] for p in mesh.data.vertices])
    data = {'note': 'Weights of the %s with the rebuilt arms, painted in Blender on 2026-10-25 '
                    '(tools/blender/wind_arms.py): automatic weights and Weight Paint fixes. '
                    'Points in the units of the rig config.' % s.animal,
            'bones': bones, 'points': [[round(float(v), 7) for v in p] for p in points],
            'weights': rows}
    path = os.path.join(s.out_dir, s.animal + '-weights.json')
    with open(path, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    return len(rows)
