"""Replays the Blender session that rebuilds the arms of the fox (the red fox violinist and the
tan fox flutist, one rig).

The rebuild uses loop edges, retopology, and extra bones to fix the arm and wrist twist. With only
four arm bones, the left forearm of the tan fox has a twist step of 63.7 degrees. The inner side
of the fox upper arm joins the trunk down to the armpit at about 0.6 of the upper arm. A cut at a
right angle to the bone then runs down the side of the trunk, and its bridge faces turn over in
the seated bind. So this script uses the steps of `cat_arms.py`, in a headless Blender, with check
images after the steps:

1. Import the mesh and Merge by Distance. Smooth the small notches of the fur at the back of the
   neck (`step_smooth_notches()`).
2. Cut each arm along the seam where it meets the trunk and at the wrist, fill a side wall of the
   trunk under the arm, collapse the thin faces at the cut loops, and model a quad tube with a flat
   inner side on the wall.
3. Shrinkwrap, Bridge Edge Loops, Beautify Faces, Collapse Edges on the thin bridge faces, UV,
   the bake of the fur color, and the transfer of the custom normals.
4. Make each arm `factor` times longer, put the arm image in a strip of the atlas, give the inner
   side the fur color of the trunk, and write `fox-arms.glb`.
5. Add the studio skeleton with the arm segments and the helpers, parent with automatic weights,
   and paint the fixes of `cat_arms.step_paint()` with the Weight Paint tools. The fingers keep half
   of their weight (`step_fingers()`), as the rule `weights.fingers` of a rig config.
6. Write the weights for `paintedWeights` of the config (`fox-weights.json`).

The red fox and the tan fox share the rig, so one session serves both roles. The tan fox keeps its
palette of the same faces (`paletteMap()` of `tools/studio-palette.ts`).

Run it in a terminal from the root of the tree:

    Blender -b --factory-startup -P tools/blender/fox_arms.py -- [<out dir>] [--views <dir>]

A run gives the same `fox-arms.glb` and `fox-weights.json`, byte for byte. `--views <dir>` writes
the check images of `cat_arms.look()`.
"""

import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cat_arms as ca  # noqa: E402
import wind_arms as wa  # noqa: E402

va = ca.va

#: The settings of the fox, with the keys of the settings of `cat_arms.py`, in the units of the
#: studio (1 unit from the soles to the ear tips). Below the armpit at y 0.515, the side of the
#: trunk stands at |x| 0.093, and the free arm starts at |x| 0.113, so the seam plane stands at |x|
#: 0.1. The shoulder has no ring (`seam.rings`): two rings packed at the short socket fold into a
#: dark slit at the back of the arm root. The first ring of the tube takes Blender weights
#: (`seam.ruled` 0). The tube near the side walls takes a chest share of 0.4 (`anchor`): with 0.2,
#: the right arm of the red fox folds 9 to 11 faces at rest. `fingers`: the share of the weight of
#: each finger bone that the fingers keep (`step_fingers()`). `notches`: the sphere at the back of
#: the neck, below the ruff, whose vertices `step_smooth_notches()` smooths.
FOX = {
    'config': 'tools/mesh-rigs/fox.json',
    'source': 'assets/models/fox/fox.glb',
    'folder': 'assets/models/fox',
    'factor': 1.21,
    'slim': (1.0, 1.0),
    'cut': {'shoulder': 0.0, 'tilt': 0.0, 'wrist': 0.1},
    'zone': {'x': 0.06, 'radius': 0.08},
    'gap': 0.016,
    'upper': (0.45, 0.6, 0.75),
    'fore': 6,
    'texture': 512,
    'faces': 1200,
    'seam': {'x': 0.1, 'lean': 0.0, 'low': 0.44, 'reach': 0.06, 'edge': 0.54, 'armpit': 0.55,
             'lift': -0.004, 'rings': (), 'ruled': 0, 'ramp': 10, 'round': 3,
             'wrap': 0.03},
    'anchor': {'share': 0.4, 'reach': 0.08, 'crease': True},
    'fingers': 0.5,
    'notches': {'center': (0.0, 0.65, -0.02), 'radius': 0.05, 'rounds': 4, 'factor': 0.5},
}
va.ANIMALS['fox'] = FOX


def step_fingers(s):
    """Keeps the share `fingers` of the weight of each finger bone (Weight Paint, Levels with
    that gain), and gives the rest to the other bones of the vertex (Normalize All with the finger
    group locked), as the rule `weights.fingers` of the config does for rule weights. 1 keeps the
    automatic weights."""
    share = s.spec['fingers']
    if share >= 1:
        return 0
    mesh = s.mesh
    groups = mesh.vertex_groups
    va.paint_mode(mesh)
    for side in 'LR':
        groups.active_index = groups[f'fingers_{side}'].index
        va.bpy.ops.object.vertex_group_levels(group_select_mode='ACTIVE', gain=share)
        va.bpy.ops.object.vertex_group_normalize_all(group_select_mode='BONE_DEFORM',
                                                     lock_active=True)
    va.bpy.ops.object.mode_set(mode='OBJECT')
    return share


def step_weights(s):
    """Writes the weights file (`cat_arms.step_weights()`), with a note that names this script."""
    count = ca.step_weights(s)
    path = os.path.join(s.out_dir, 'fox-weights.json')
    with open(path) as f:
        data = json.load(f)
    data['note'] = ('Weights of the fox with the rebuilt arms, painted in Blender on 2026-10-25 '
                    '(tools/blender/fox_arms.py): automatic weights and Weight Paint fixes. '
                    'Points in the units of the studio.')
    with open(path, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    return count


def step_clean_cut(s):
    """Collapses the thin faces at the top arc of the seam and at the wrist loop (Collapse
    Edges, `wind_arms.step_clean_cut()`), after the side wall. The Bisect of the seam leaves thin
    faces on the trunk where its plane passes near a corner, and they folded at rest."""
    return wa.step_clean_cut(s)


def step_clean_bridge(s):
    """Collapses the thin bridge triangles at the socket and the wrist (Collapse Edges), after
    Beautify Faces, as `wind_arms.step_clean_bridge()` does, with the armpit line of the side wall
    as a part of the socket. On the fox, bridge faces with corners of 4 to 9 degrees lay on the
    plane of the seam and folded at rest and in the play. Gives the number of collapsed edges."""
    import bmesh

    mesh = s.mesh
    bpy = va.bpy
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(mesh.data)
    part = bm.verts.layers.int['arm_part']
    loops = {ca.PART[c] + off for c in ('shoulder', 'armpit', 'wrist') for off in (0, 10)}
    tubes = {ca.PART['tube'], ca.PART['tube'] + 10}
    count = 0
    for _ in range(200):
        thin = None
        for f in bm.faces:
            codes = [p[part] for p in f.verts]
            if (sum(c in loops for c in codes) == 2 and any(c in tubes for c in codes)
                    and min(math.degrees(c.calc_angle()) for c in f.loops) < wa.CUT_ANGLE):
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


def step_smooth_notches(s):
    """Smooths the small notches of the fur at the back of the neck, below the ruff (`notches` of
    `FOX`): Smooth Vertices, with the factor `factor`, `rounds` times, on the vertices within
    `radius` of `center`, in the units of the studio. The undersides of the notches face down,
    away from the light, and show as a dark V on the back of the red and the tan fox. No other
    vertex moves. Gives the number of the smoothed vertices."""
    import bmesh

    spec = s.spec.get('notches')
    if not spec:
        return 0
    mesh = s.mesh
    bpy = va.bpy
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(mesh.data)
    center = s.fr.point(spec['center'])
    radius = s.units(spec['radius'])
    verts = [p for p in bm.verts if (p.co - center).length < radius]
    for _ in range(spec['rounds']):
        bmesh.ops.smooth_vert(bm, verts=verts, factor=spec['factor'], use_axis_x=True,
                              use_axis_y=True, use_axis_z=True)
    bmesh.update_edit_mesh(mesh.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    return len(verts)


#: The steps of the session: the steps of `cat_arms.py`, with the clean of the cut loops after the
#: side wall, the clean of the bridge after Beautify Faces, the share of the fingers after the
#: paint, and the weights file above.
STEPS = tuple(out for step in ca.STEPS
              for out in {va.import_mesh: (va.import_mesh, step_smooth_notches),
                          ca.step_wall: (ca.step_wall, step_clean_cut),
                          ca.step_beautify: (ca.step_beautify, step_clean_bridge),
                          ca.step_paint: (ca.step_paint, step_fingers),
                          ca.step_weights: (step_weights,)}.get(step, (step,)))


def main():
    """Runs the steps and writes `fox-arms.glb` and `fox-weights.json` into the out dir
    (`assets/models/fox` by default)."""
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if '--views' in argv:
        k = argv.index('--views')
        ca.VIEWS = os.path.abspath(argv[k + 1])
        os.makedirs(ca.VIEWS, exist_ok=True)
        del argv[k:k + 2]
    out_dir = os.path.abspath(argv[0]) if argv else None
    va.clear_scene()
    s = va.Session('fox', out_dir)
    for step in STEPS:
        print('%s: %s' % (step.__name__, step(s)))


if __name__ == '__main__':
    main()
