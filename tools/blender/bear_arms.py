"""Replays the Blender session that rebuilds the arms of the bear conductor.

The long thin faces of the arms of `bear-tpose.glb` fold into dark shards under the raised
forearm, and the inner elbow of the bind collapses into a hollow. The rebuild uses loop edges,
retopology, and extra bones to fix the arm and wrist twist. This script repeats the steps of
`wind_arms.py` with the settings of the bear (`BEAR`):

1. Import the mesh and Merge by Distance.
2. Replace the faces of each arm from the shoulder line to the wrist with a quad tube, wrap it onto
   the source arm, bridge it to the trunk and to the paw, beautify the bridge triangles, and
   collapse the thin faces at the cut loops.
3. Give the new arm faces a UV layout, and bake the fur color of the source arm. Then make the
   inner side of each upper arm a little flatter (`step_flatten()` of `elephant_arms.py`),
   because the thick upper arm goes into the round belly when it comes down. Then transfer the
   custom normals of the source surface.
4. Keep the length and the cross-section of the arms (`factor` 1, `slim` 1), put the arm image in
   a strip of the atlas, and write `bear-arms.glb`.
5. Add the studio skeleton with the arm segments and the helpers, parent with automatic weights,
   and paint the fixes with the Weight Paint tools.
6. Write the weights for `paintedWeights` of the config (`bear-weights.json`).

The faces of the paws, the trunk, the legs, and the head stay the faces of the source mesh. The
source file, `bear-tpose.glb`, stays unchanged.

Run it in a terminal from the root of the tree:

    Blender -b --factory-startup -P tools/blender/bear_arms.py -- [<out dir>]

In the live Blender of MCP, `run_steps()` runs one step at a time.
"""

import importlib.util
import json
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

#: The settings of the bear, with the keys of `ANIMALS` of `violin_arms.py` and `wind_arms.py`,
#: in the units of the studio (1 unit from the soles to the top). They are the settings of the
#: polar bear (`polar_bear_arms.py`), moved to the arm root of the bear: the arm is free of the
#: trunk beyond |x| 0.18, from y 0.58 to 0.75. The shoulder cut stands at 0.2 of the upper arm,
#: and the zone has the radius 0.12: nearer the trunk, or with a smaller radius, the cut found no
#: closed loop around the arm. The forearm is 0.09 units long, so it has 4 inner rings. `flatten`
#: moves the inner side of each upper arm toward its axis, along the mean direction of the corners
#: that go into the belly.
BEAR = {
    'config': 'tools/mesh-rigs/bear.json',
    'source': 'assets/models/bear/bear-tpose.glb',
    'folder': 'assets/models/bear',
    'factor': 1.0,
    'slim': (1.0, 1.0),
    'cut': {'shoulder': 0.2, 'tilt': 0.0, 'wrist': 0.3},
    'zone': {'x': 0.12, 'radius': 0.12},
    'gap': 0.022,
    'wristGap': 0.016,
    'upper': (0.3, 0.45, 0.6, 0.75),
    'fore': 4,
    'texture': 512,
    'faces': 900,
    'paint': {'trunk': {'x': 0.175, 'y': (0.4, 0.76)}, 'root': {'x': (0.135, 0.235),
                                                                 'y': (0.6, 0.78)}},
    'flatten': {'along': (0.3, 0.6), 'dir': (0.0, -0.2, 0.98), 'cone': 45.0,
                'move': 0.015, 'size': 0.05},
    'head': {'x': 0.12, 'y': 0.77},
    'fingers': 0.5,
}


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
    the axis of the last ring of the tube, as `cut_planes()` of `polar_bear_arms.py` does.

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
    Point), as `smooth_wrists()` and `retopo_snap_wrists()` of `polar_bear_arms.py` do. The ring
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


def step_weights(s):
    """Writes the weights file as `step_weights()` of `wind_arms.py` does, with a note that names
    this script."""
    count = wa.step_weights(s)
    path = os.path.join(s.out_dir, s.animal + '-weights.json')
    with open(path) as f:
        data = json.load(f)
    data['note'] = ('Weights of the bear with the rebuilt arms, painted in Blender on 2026-10-26 '
                    '(tools/blender/bear_arms.py): automatic weights and Weight Paint fixes. '
                    'Points in the units of the rig config.')
    with open(path, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    return count


#: The steps of the session: the steps of `wind_arms.py`, with the clean steps of the shoulder
#: first, the flatter inner upper arms after the bake, the paint fixes above, and the weights file
#: above. The bake casts its rays from 0.006 units out of the tube (`step_bake()` of
#: `violin_arms.py`). A flatten before the bake moves the tube up to 0.015 units into the source
#: arm, the rays miss the source, and the bake writes black under each armpit. After the bake, the
#: flatten moves the vertices and keeps their texels.
STEPS = tuple(
    out for step in wa.STEPS
    for out in {wa.step_weights: (step_weights,), wa.step_paint: (step_paint,),
                wa.step_cut_and_tube: (step_cut_and_tube,),
                wa.step_clean_cut: (shoulder_first(wa.step_clean_cut),),
                wa.step_clean_bridge: (shoulder_first(wa.step_clean_bridge), step_smooth_wrist),
                va.step_bake: (va.step_bake, ea.step_flatten)}
    .get(step, (step,)))


def run_steps(s, first=0, last=len(STEPS)):
    """Runs the steps from `first` up to `last` (not included), and prints the result of each."""
    for step in STEPS[first:last]:
        print('%s: %s' % (step.__name__, step(s)))


def main():
    """Runs the steps of the session and writes the source mesh and the weights into the out dir
    (`assets/models/bear/` by default)."""
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out_dir = os.path.abspath(argv[0]) if argv else None
    wa.ANIMALS['bear'] = BEAR
    va.clear_scene()
    s = wa.Session('bear', out_dir)
    run_steps(s)
    print('bear_arms: wrote bear-arms.glb and bear-weights.json into %s' % s.out_dir)


if __name__ == '__main__':
    main()
