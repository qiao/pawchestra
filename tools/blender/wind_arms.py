"""Replays the Blender session that rebuilds the arms of the mouse oboist and the wolf clarinetist.

The rebuild uses loop edges, retopology, and extra bones to fix the arm and wrist twist. The
session uses the steps of `violin_arms.py` on the mouse and the wolf, in the live Blender through
MCP, with an image after each step. This script repeats them in the same order with the settings
of each animal (`ANIMALS`). The steps are the steps of `violin_arms.py`, with four changes (marked
*):

1. Import the mesh and Merge by Distance.
2. Replace the faces of each arm from the shoulder line to the wrist with a quad tube, wrap it onto
   the source arm, bridge it to the trunk and to the paw, and beautify the bridge triangles.
   * The rings of the elbow and of the wrist can have their own gaps (`arm_stations()`).
   * Collapse Edges removes the thin faces that the Bisect and the bridge leave at each cut loop
     (`step_clean_cut()`, `step_clean_bridge()`).
3. Give the new arm faces a UV layout, bake the fur color of the source arm, and transfer the
   custom normals of the source surface.
4. Make each arm `factor` times longer (`step_shape()`), as the rule `armFactor` of a rig config
   does, put the arm image in a strip of the atlas, and write `<animal>-arms.glb`.
5. Add the studio skeleton with the arm segments and the helpers, parent with automatic weights,
   and paint the fixes with the Weight Paint tools.
   * The paint has two more fixes for the mouse: the side of the trunk and the elbows
     (`step_paint()`).
6. Write the weights for `paintedWeights` of the config (`<animal>-weights.json`).
   * Each point is in the units of the rig config (`config_points()`).

The wolf config scales the source (`proportions`) and softens the brow (`soften`) in
`load_mesh()` of `rig_mesh.py`, and its joints are in the units of the scaled source. The session
works in the units of the source: `source_units()` gives the arm joints there, and
`step_weights()` writes each point in the units of the scaled source, as `rig_mesh.py` reads it.

Run it in a terminal from the root of the tree:

    Blender -b --factory-startup -P tools/blender/wind_arms.py -- <animal> [<out dir>]

In the live Blender of MCP, `run_steps()` runs one step at a time.
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

#: The settings of each animal, with the keys of `ANIMALS` of `violin_arms.py`. `paint` can also
#: name the fixes of `step_paint()`: `side`, the side of the trunk below the armpit, `elbow`, the
#: vertices near each elbow joint, and `pit`, the front of the armpit.
ANIMALS = {
    'mouse': {
        'config': 'tools/mesh-rigs/mouse.json',
        'source': 'assets/models/mouse/mouse.glb',
        'folder': 'assets/models/mouse',
        'factor': 1.25,
        'slim': (1.0, 1.0),
        'cut': {'shoulder': 0.6, 'tilt': 0.0, 'wrist': 0.1},
        'zone': {'x': 0.06, 'radius': 0.08},
        'gap': 0.0085,
        'cleanPit': {'x': (0.08, 0.13), 'y': (0.48, 0.6)},
        'upper': (0.7, 0.8),
        'fore': 6,
        'texture': 512,
        'faces': 600,
        'paint': {'trunk': {'x': 0.08, 'y': (0.3, 0.52)}, 'root': {'x': (0.08, 0.15),
                                                                   'y': (0.48, 0.64)},
                  'side': {'x': 0.115, 'y': (0.3, 0.545), 'repeat': 4},
                  'elbow': {'radius': 0.05, 'repeat': 16},
                  'pit': {'x': (0.08, 0.13), 'y': (0.5, 0.6), 'front': 0.05, 'repeat': 10}},
    },
    'wolf': {
        'config': 'tools/mesh-rigs/wolf.json',
        'source': 'assets/models/wolf/wolf.glb',
        'folder': 'assets/models/wolf',
        'factor': 1.178,
        'slim': (1.0, 1.0),
        'cut': {'shoulder': 0.3, 'tilt': 20.0, 'wrist': 0.1},
        'zone': {'x': 0.06, 'radius': 0.08},
        'gap': 0.016,
        'wristGap': 0.0085,
        'upper': (0.45, 0.6, 0.75),
        'fore': 6,
        'texture': 512,
        'faces': 600,
        'paint': {'trunk': {'x': 0.07, 'y': (0.35, 0.56)}, 'root': {'x': (0.06, 0.12),
                                                                    'y': (0.52, 0.66)}},
    },
}


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


class Session(va.Session):
    """A session of `violin_arms.py` with the joints in the units of the source."""

    def __init__(self, animal, out_dir=None):
        va.ANIMALS.update(ANIMALS)
        super().__init__(animal, out_dir)
        rule = self.config.get('proportions')
        if rule:
            self.joints = va.source_joints(source_units(self.config['joints'], rule),
                                           self.spec['factor'])


def step_paint(s):
    """Paints the fixes of `step_paint()` of `violin_arms.py`, then the fixes of `paint` of the
    animal, with the Weight Paint tools. The places are in the units of the studio (`Frame`).

    1. `side`: Remove From Group of the arm bones on the original vertices of the trunk inside
       |x| `side.x`, from `side.y[0]` to `side.y[1]`, and Smooth on them `side.repeat` times. On
       the mouse, the side of the trunk below the armpit followed the arm, and its faces folded
       when the arm hung against the body at rest.
    2. `elbow`: Smooth `elbow.repeat` times on the vertices within `elbow.radius` of each elbow
       joint, so that the weights of the elbow helper fade over the rings of the joint. On the
       mouse, faces of the inner elbow folded at rest.
    3. `pit`: Smooth `pit.repeat` times on the vertices in front of the armpit: |x| from `pit.x[0]`
       to `pit.x[1]`, the height from `pit.y[0]` to `pit.y[1]`, and z beyond `pit.front`. On the
       mouse, the long faces there folded at rest with the right elbow out and back.
    """
    va.step_paint(s)
    mesh, fr, paint = s.mesh, s.fr, s.spec['paint']

    def place(p):
        return (abs(p.co.x) / fr.height, (p.co.z - fr.floor) / fr.height)

    side = paint.get('side')
    if side:
        attr = mesh.data.attributes['arm_part'].data
        va.paint_mode(mesh, lambda p: place(p)[0] < side['x'] and side['y'][0] < place(p)[1]
                      < side['y'][1] and attr[p.index].value == 0)
        va.remove_from(mesh, va.arm_groups())
        bpy.ops.object.vertex_group_normalize_all(group_select_mode='BONE_DEFORM',
                                                  lock_active=False)
        bpy.ops.object.vertex_group_smooth(group_select_mode='BONE_DEFORM', factor=0.5,
                                           repeat=side['repeat'])
        va.limit_and_normalize()
        bpy.ops.object.mode_set(mode='OBJECT')
    elbow = paint.get('elbow')
    if elbow:
        joint = s.config['joints']['forearm_L']['head']
        if s.config.get('proportions'):
            joint = source_point(joint, s.config['proportions'])
        points = [fr.point(joint, k) for k in (1, -1)]
        va.paint_mode(mesh, lambda p: min((p.co - q).length for q in points)
                      < elbow['radius'] * fr.height)
        bpy.ops.object.vertex_group_smooth(group_select_mode='BONE_DEFORM', factor=0.5,
                                           repeat=elbow['repeat'])
        va.limit_and_normalize()
        bpy.ops.object.mode_set(mode='OBJECT')
    pit = paint.get('pit')
    if pit:
        va.paint_mode(mesh, lambda p: pit['x'][0] < place(p)[0] < pit['x'][1]
                      and pit['y'][0] < place(p)[1] < pit['y'][1]
                      and -p.co.y / fr.height > pit['front'])
        bpy.ops.object.vertex_group_smooth(group_select_mode='BONE_DEFORM', factor=0.5,
                                           repeat=pit['repeat'])
        va.limit_and_normalize()
        bpy.ops.object.mode_set(mode='OBJECT')
    mesh.data.use_paint_mask_vertex = False


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


def step_clean_pit(s):
    """Collapses the thin faces of the source in front of and under each armpit (Collapse Edges),
    in the box `cleanPit` of the animal: |x| from `x[0]` to `x[1]` and the height from `y[0]` to
    `y[1]`, in the units of the studio. On the mouse, the upper arm joins the trunk there, and
    thin faces of the source with corners of 5° to 10° folded in each pose. While a face in the box
    has a corner below `CUT_ANGLE`, its shortest edge collapses to its middle, and a merged vertex
    of a cut loop stays a vertex of the loop. Gives the number of collapsed edges.
    """
    import bmesh

    box = s.spec.get('cleanPit')
    if not box:
        return 0
    mesh, fr = s.mesh, s.fr
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(mesh.data)
    part = bm.verts.layers.int['arm_part']

    def inside(f):
        c = f.calc_center_median()
        x, y = abs(c.x) / fr.height, (c.z - fr.floor) / fr.height
        return box['x'][0] < x < box['x'][1] and box['y'][0] < y < box['y'][1]

    count = 0
    for _ in range(200):
        thin = next((f for f in bm.faces if all(p[part] == 0 or p[part] in (1, 11) for p in f.verts)
                     and inside(f)
                     and min(math.degrees(c.calc_angle()) for c in f.loops) < CUT_ANGLE), None)
        if thin is None:
            break
        edge = min(thin.edges, key=lambda e: e.calc_length())
        code = max(p[part] for p in edge.verts)
        bmesh.ops.collapse(bm, edges=[edge], uvs=True)
        count += 1
        if code:
            for p in bm.verts:
                if p.is_valid and p[part] == 0 and p.is_boundary and any(
                        e.other_vert(p)[part] == code for e in p.link_edges):
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


#: The steps of the session, in order: the steps of `violin_arms.py`, with the clean cut, the
#: clean bridge, the skeleton, the paint, and the weights file above.
STEPS = tuple(
    out for step in va.STEPS
    for out in {va.step_skeleton: (step_skeleton,), va.step_weights: (step_weights,),
                va.step_cut_and_tube: (step_cut_and_tube, step_clean_cut, step_clean_pit),
                va.step_beautify: (va.step_beautify, step_clean_bridge),
                va.step_paint: (step_paint,)}.get(step, (step,)))


def run_steps(s, first=0, last=len(STEPS)):
    """Runs the steps from `first` up to `last` (not included), and prints the result of each."""
    for step in STEPS[first:last]:
        print('%s: %s' % (step.__name__, step(s)))


def main():
    """Runs the steps of the session and writes the source mesh and the weights into the out dir
    (the folder of the animal in `assets/models/` by default)."""
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    animal = argv[0] if argv else 'mouse'
    out_dir = os.path.abspath(argv[1]) if len(argv) > 1 else None
    va.clear_scene()
    s = Session(animal, out_dir)
    run_steps(s)
    print('wind_arms: wrote %s-arms.glb and %s-weights.json into %s'
          % (animal, animal, s.out_dir))


if __name__ == '__main__':
    main()
