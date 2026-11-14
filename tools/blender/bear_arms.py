"""Gives the steps of the arm rebuild of a T-pose mesh, which `rhino_tpose_arms.py` at 8e42c4eaa
ran with the settings of the old rhino.

The steps are the steps of `wind_arms.py`, with these changes:

1. The wrist cut plane stands at a right angle to the last ring of the tube (`cut_planes()`).
2. The clean steps run on the shoulder loops first, with a larger angle (`SHOULDER_ANGLE`).
3. Smooth Vertices and a Shrinkwrap even the band of each wrist (`step_smooth_wrist()`).
4. The inner side of each upper arm gets a little flatter after the bake (`step_flatten()` of
   `elephant_arms.py`).
5. The paint removes the head bone from the shoulders, and gives a share of the fingers weight to
   the hand bone (`step_paint()`, the keys `head` and `fingers` of the settings).

The settings of a session have the keys of `ANIMALS` of `violin_arms.py` and `wind_arms.py`.
"""

import importlib.util
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))


def load_elephant_arms():
    """Loads `elephant_arms.py` from the folder of this script as the module `elephant_arms`. It
    loads `wind_arms.py` and `violin_arms.py` in turn."""
    if 'elephant_arms' in sys.modules:
        return sys.modules['elephant_arms']
    path = os.path.join(HERE, 'elephant_arms.py')
    spec = importlib.util.spec_from_file_location('elephant_arms', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    sys.modules['elephant_arms'] = module
    return module


ea = load_elephant_arms()
wa = ea.wa
va = ea.va

#: The smallest corner angle, in degrees, of a face at a shoulder loop and of a shoulder bridge
#: face after the clean steps. The wrist loops keep the angle of `wind_arms.py` (12). With 12 at the
#: shoulder, the thin faces there folded 17 faces of the left arm in the play (limit 8), and with
#: 20 at the wrist, the collapses broke the wrist into a dark notch.
SHOULDER_ANGLE = 20.0


#: The cut planes of `violin_arms.py`, which `cut_planes()` changes for the bear.
CUT_PLANES = va.cut_planes

#: The rounds and the factor of Smooth Vertices on the band of each wrist (`step_smooth_wrist()`),
#: as on the polar bear.
WRIST_SMOOTH = (4, 0.5)


def cut_planes(s, line, side):
    """Gives the cut planes of `violin_arms.cut_planes()`, with the wrist plane at a right angle to
    the axis of the last ring of the tube, as `cut_planes()` of `polar_bear_arms.py` at cbc8db5e4
    does.

    The last ring stands at the wrist joint at a right angle to the line halfway between the
    forearm and the paw (`violin_arms.arm_stations()`). The wrist plane of `violin_arms.py` stands
    at a right angle to the paw, which turns down from the forearm, so the band from the ring to
    the cut loop is wide on the top of the wrist and thin on the palm side. The bind shows its
    sharp edges as a crease on the top of each wrist. With the two planes parallel, the band is
    about as wide all around.
    """
    shoulder, _ = CUT_PLANES(s, line, side)
    _, e, w, t = line
    axis = ((w - e).normalized() + (t - w).normalized()).normalized()
    return [shoulder, (w + axis * ((t - w).length * s.spec['cut']['wrist']), axis)]


def step_cut_and_tube(s):
    """Cuts both arms and models both tubes as `step_cut_and_tube()` of `wind_arms.py` does, with
    the wrist plane of `cut_planes()`."""
    va.cut_planes = cut_planes
    try:
        return wa.step_cut_and_tube(s)
    finally:
        va.cut_planes = CUT_PLANES


def wrist_band(bm, part):
    """Gives the vertices of the band of both wrists: the cut loop of each paw, and the tube
    vertices that join the loop by an edge (the last ring)."""
    loops = {va.PART['wrist'], va.PART['wrist'] + 10}
    tubes = {va.PART['tube'], va.PART['tube'] + 10}
    return [p for p in bm.verts if p[part] in loops or (
        p[part] in tubes and any(e.other_vert(p)[part] in loops for e in p.link_edges))]


def step_smooth_wrist(s):
    """Smooths the band of each wrist (Smooth Vertices, `WRIST_SMOOTH`) after the clean of the
    bridge, then puts it back on the surface of the source arm (Shrinkwrap, Nearest Surface
    Point), as `smooth_wrists()` and `retopo_snap_wrists()` of `polar_bear_arms.py` at cbc8db5e4
    do. The ring
    is round and the cut loop has the form of the paw, so the bridge keeps small steps. The smooth
    alone pulls the band in, and the snap gives it the form of the source mesh. Gives the
    number of the band vertices."""
    import bmesh
    bpy = va.bpy
    mesh = s.mesh
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(mesh.data)
    verts = wrist_band(bm, bm.verts.layers.int['arm_part'])
    rounds, factor = WRIST_SMOOTH
    for _ in range(rounds):
        bmesh.ops.smooth_vert(bm, verts=verts, factor=factor, use_axis_x=True, use_axis_y=True,
                              use_axis_z=True)
    bm.verts.index_update()
    ids = [p.index for p in verts]
    bmesh.update_edit_mesh(mesh.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    group = mesh.vertex_groups.new(name='wrist-band')
    group.add(ids, 1.0, 'REPLACE')
    s.source.hide_set(False)
    mod = mesh.modifiers.new('snap', 'SHRINKWRAP')
    mod.target = s.source
    mod.wrap_method = 'NEAREST_SURFACEPOINT'
    mod.vertex_group = group.name
    va.apply_modifier(mesh, mod)
    mesh.vertex_groups.remove(mesh.vertex_groups['wrist-band'])
    s.source.hide_set(True)
    return len(ids)


def shoulder_first(step):
    """Gives a clean step of `wind_arms.py` that first runs on the shoulder loops alone with
    `SHOULDER_ANGLE`, then on all loops with the angle of `wind_arms.py`. The clean steps find the
    loops by the codes of `PART`, so the wrist code is out of use in the first pass."""
    def run(s):
        wrist, angle = va.PART['wrist'], wa.CUT_ANGLE
        va.PART['wrist'], wa.CUT_ANGLE = -1, SHOULDER_ANGLE
        try:
            first = step(s)
        finally:
            va.PART['wrist'], wa.CUT_ANGLE = wrist, angle
        return first, step(s)
    run.__name__ = step.__name__
    return run


def step_paint(s):
    """Paints the fixes of `step_paint()` of `wind_arms.py`, then removes the head bone from the
    shoulders: Remove From Group of `head` on the vertices out from |x| `head.x` and below the
    height `head.y`, in the units of the studio, then Limit Total and Normalize All. The automatic
    weights gave the corners of the shoulder line up to 0.18 of the head, so that each head turn of
    the conductor pulled the front of the shoulder, and its faces folded in most play samples. The
    rule weights give the head only the vertices above `headFrom` of the config (0.79).

    Then each paw gives the share 1 - `fingers` of the fingers weight to the hand bone: a Vertex
    Weight Mix modifier adds the fingers weight to the hand weight at the influence of that share,
    and Levels scales the fingers weight by `fingers`. The rule weights give the fingers half of
    their bone (`weights.fingers` of the config). With the full fingers weight of the automatic
    weights, the curl of the fingers at rest folded the faces of the paws."""
    wa.step_paint(s)
    mesh, fr, head = s.mesh, s.fr, s.spec['head']
    va.paint_mode(mesh, lambda p: abs(p.co.x) / fr.height > head['x']
                  and (p.co.z - fr.floor) / fr.height < head['y'])
    va.remove_from(mesh, ['head'])
    va.limit_and_normalize()
    bpy.ops.object.mode_set(mode='OBJECT')
    mesh.data.use_paint_mask_vertex = False
    share = s.spec['fingers']
    for side in 'LR':
        mix = mesh.modifiers.new('fingers', 'VERTEX_WEIGHT_MIX')
        mix.vertex_group_a, mix.vertex_group_b = f'hand_{side}', f'fingers_{side}'
        mix.mix_mode, mix.mix_set, mix.mask_constant = 'ADD', 'B', 1 - share
        bpy.context.view_layer.objects.active = mesh
        # The armature modifier comes first, so the mix goes first to work on the bind weights.
        bpy.ops.object.modifier_move_to_index(modifier=mix.name, index=0)
        bpy.ops.object.modifier_apply(modifier=mix.name)
        va.paint_mode(mesh)
        mesh.vertex_groups.active_index = mesh.vertex_groups[f'fingers_{side}'].index
        bpy.ops.object.vertex_group_levels(group_select_mode='ACTIVE', gain=share)
        bpy.ops.object.mode_set(mode='OBJECT')
    va.paint_mode(mesh)
    va.limit_and_normalize()
    bpy.ops.object.mode_set(mode='OBJECT')


#: The steps of the session: the steps of `wind_arms.py`, with the clean steps of the shoulder
#: first, the flatter inner upper arms after the bake, and the paint fixes above. The bake casts
#: its rays from 0.006 units out of the tube (`step_bake()` of `violin_arms.py`). A flatten before
#: the bake moves the tube up to 0.015 units into the source arm, the rays miss the source, and the
#: bake writes black under each armpit. After the bake, the flatten moves the vertices and keeps
#: their texels.
STEPS = tuple(
    out for step in wa.STEPS
    for out in {wa.step_paint: (step_paint,),
                wa.step_cut_and_tube: (step_cut_and_tube,),
                wa.step_clean_cut: (shoulder_first(wa.step_clean_cut),),
                wa.step_clean_bridge: (shoulder_first(wa.step_clean_bridge), step_smooth_wrist),
                va.step_bake: (va.step_bake, ea.step_flatten)}
    .get(step, (step,)))

