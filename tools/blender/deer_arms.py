"""Replays the Blender session that rebuilds the arms of the deer harpist.

Each upper arm of the mesh `deer.glb` joins the side of the trunk down to 0.86 (left) and 0.94
(right) of its length. When the arm and the trunk are two shells below the cut, the back of each
upper arm moves off the trunk in the play and shows a notch. The rebuild uses loop edges,
retopology, and extra bones to fix the arm and wrist twist. This script gives the deer the arms
of the cat and the fox (`cat_arms.py`, `fox_arms.py`): one skin from the trunk to the paw, with a
real armpit.

1. Import the mesh and Merge by Distance.
2. Cut each arm along the seam where it meets the trunk and at the wrist, fill a side wall of the
   trunk under the arm, collapse the thin faces at the cut loops, and model a quad tube with a flat
   inner side on the wall.
3. Shrinkwrap, Bridge Edge Loops, Beautify Faces, Collapse Edges on the thin bridge faces, UV,
   the bake of the fur color, and the transfer of the custom normals.
4. Make each arm `factor` times longer, put the arm image in a strip of the atlas, give the inner
   side the fur color of the trunk, and write `deer-arms.glb`.
5. Add the studio skeleton with the arm segments and the helpers, parent with automatic weights,
   and paint the fixes of `cat_arms.step_paint()` with the Weight Paint tools. The fingers keep
   half of their weight (`fox_arms.step_fingers()`), as the rule `weights.fingers` of a rig
   config.
6. Write the weights for `paintedWeights` of the config (`deer-weights.json`).

The faces of the paws, the trunk, the legs, and the head stay the faces of the source mesh. The
source file, `deer.glb`, stays unchanged.

Run it in a terminal from the root of the tree:

    Blender -b --factory-startup -P tools/blender/deer_arms.py -- [<out dir>] [--views <dir>]

A run gives the same `deer-arms.glb` and `deer-weights.json`, byte for byte. `--views <dir>`
writes the check images of `cat_arms.look()`.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cat_arms as ca  # noqa: E402
import fox_arms as fa  # noqa: E402

va = ca.va

#: The settings of the deer, with the keys of the settings of `cat_arms.py`, in the units of the
#: studio (1 unit from the soles to the tips of the antlers). The upper arm is about 0.06 units
#: thick. Below the free root at y 0.47, the side of the trunk stands at |x| 0.081 and the inner
#: side of the arm at |x| 0.084.
DEER = {
    'config': 'tools/mesh-rigs/deer.json',
    'source': 'assets/models/deer/deer.glb',
    'folder': 'assets/models/deer',
    'factor': 1.25,
    'slim': (1.0, 1.0),
    'cut': {'shoulder': 0.0, 'tilt': 0.0, 'wrist': 0.1},
    'zone': {'x': 0.06, 'radius': 0.08},
    'gap': 0.016,
    'upper': (0.45, 0.6, 0.75),
    'fore': 6,
    'texture': 512,
    'faces': 1200,
    'seam': {'x': 0.083, 'lean': 0.1, 'low': 0.44, 'reach': 0.06, 'edge': 0.5, 'armpit': 0.505,
             'lift': -0.004, 'rings': (0.5,), 'ruled': 0, 'ramp': 10, 'round': 3,
             'wrap': 0.012, 'cap': {'share': 0.2, 'tilt': 30.0}},
    'anchor': {'share': 0.2, 'reach': 0.03, 'crease': True},
    'fingers': 0.5,
}
va.ANIMALS['deer'] = DEER

#: The middle and the size of the check images of `cat_arms.look()` for the deer: the left arm,
#: and the left shoulder for the images of the shoulder.
LOOK = {'arm': ((0.13, 0.43, 0.0), 0.36), 'shoulder': ((0.105, 0.51, 0.0), 0.13)}

_look = ca.look


def look(s, name, objects=None, center=None, scale=None, views=None):
    """Renders the check views of `cat_arms.look()` at the arm of the deer."""
    center, size = LOOK['shoulder' if 'shoulder' in name else 'arm']
    if views is None:
        _look(s, name, objects, center, size)
    else:
        _look(s, name, objects, center, size, views)


ca.look = look


def cap_plane(s, side):
    """Gives the cap plane of one side in Blender (a point and the unit normal toward the elbow):
    at the share `cap.share` of the upper arm from the shoulder joint, at a right angle to the
    upper arm, and turned `cap.tilt` degrees toward the side of the trunk, as the plane of the
    shoulder line of `violin_arms.cut_planes()`."""
    import math

    from mathutils import Vector

    cap = s.spec['seam']['cap']
    a, e, _, _ = va.arm_line(s, side)
    u = (e - a).normalized()
    tilt = math.radians(cap['tilt'])
    normal = (u * math.cos(tilt) + Vector((side, 0, 0)) * math.sin(tilt)).normalized()
    return a.lerp(e, cap['share']), normal


def step_cut(s):
    """Keeps a hidden copy of the source, and cuts each arm along the seam, under the cap plane,
    and at the wrist.

    This is `cat_arms.step_cut()` with one more plane. The shoulder of the deer is a broad round
    top, and the plane of the seam leaves it only at y 0.6, near the neck. With the seam plane
    only, the hole takes the whole top of the shoulder, and the bridge from the socket to the first
    ring is a long cone of thin faces. The cap plane (`cap_plane()`) keeps the faces above it on
    the trunk: an arm face lies beyond the plane of the seam and on the side of the elbow of the
    cap plane. Each plane cuts only the faces on the arm side of the other plane.
    """
    import bmesh
    import bpy

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
                p[part] = ca.PART['wrist'] + off
        # The seam cut and the cap cut.
        seam_co, seam_no = ca.seam_plane(s, side)
        cap_co, cap_no = cap_plane(s, side)
        low = s.fr.floor + s.units(seam['low'])
        reach = s.units(0.14)
        cuts = set()
        for co, no, other_co, other_no in ((seam_co, seam_no, cap_co, cap_no),
                                           (cap_co, cap_no, seam_co, seam_no)):
            near = [f for f in bm.faces if f.calc_center_median().z > low
                    and va.seg_distance(f.calc_center_median(), a, e) < reach
                    and min((p.co - co).dot(no) for p in f.verts) < 0
                    < max((p.co - co).dot(no) for p in f.verts)
                    and max((p.co - other_co).dot(other_no) for p in f.verts) > 0]
            edges = {x for f in near for x in f.edges}
            verts = {p for f in near for p in f.verts}
            res = bmesh.ops.bisect_plane(bm, geom=list(verts) + list(edges) + near,
                                         plane_co=co, plane_no=no, dist=1e-6)
            cuts |= {x for x in res['geom_cut'] if isinstance(x, bmesh.types.BMEdge)}
        # The faces of the arm.
        fore = s.units(seam['reach'])

        def inside(f):
            c = f.calc_center_median()
            if (c - seam_co).dot(seam_no) <= 0:
                return False
            if c.z > low:
                return ((c - cap_co).dot(cap_no) > 0
                        and (va.seg_distance(c, a, e) < reach or va.seg_distance(c, e, w) < fore))
            return va.seg_distance(c, e, w) < fore or va.seg_distance(c, w, t) < fore
        mid = e.lerp(w, 0.5)
        seed = min(bm.faces, key=lambda f: (f.calc_center_median() - mid).length)
        arm, stack = set(), [seed]
        stop = wrist | {x for x in cuts if x.is_valid}
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
    ca.look(s, '1-arm-faces', [target])
    # Delete Faces.
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(mesh.data)
    zone = bm.faces.layers.int['arm_zone']
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f[zone] > 0], context='FACES')
    bmesh.update_edit_mesh(mesh.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    ca.look(s, '2-cut', [mesh])
    return out


def step_weights(s):
    """Writes the weights file (`cat_arms.step_weights()`), with a note that names this script."""
    count = ca.step_weights(s)
    path = os.path.join(s.out_dir, 'deer-weights.json')
    with open(path) as f:
        data = json.load(f)
    data['note'] = ('Weights of the deer with the rebuilt arms, painted in Blender on 2026-10-27 '
                    '(tools/blender/deer_arms.py): automatic weights and Weight Paint fixes. '
                    'Points in the units of the studio.')
    with open(path, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    return count


#: The steps of the session: the steps of `fox_arms.py` with no smooth of the fur notches, and the
#: weights file above.
STEPS = tuple(out for step in fa.STEPS
              for out in {fa.step_smooth_notches: (),
                          ca.step_cut: (step_cut,),
                          fa.step_weights: (step_weights,)}.get(step, (step,)))


def main():
    """Runs the steps and writes `deer-arms.glb` and `deer-weights.json` into the out dir
    (`assets/models/deer` by default)."""
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if '--views' in argv:
        k = argv.index('--views')
        ca.VIEWS = os.path.abspath(argv[k + 1])
        os.makedirs(ca.VIEWS, exist_ok=True)
        del argv[k:k + 2]
    out_dir = os.path.abspath(argv[0]) if argv else None
    va.clear_scene()
    s = va.Session('deer', out_dir)
    s.config.setdefault('armSegments', {'helper': 2 * DEER['gap']})
    for step in STEPS:
        print('%s: %s' % (step.__name__, step(s)))


if __name__ == '__main__':
    main()
