"""Replays the Blender session that rebuilds the arms of the T-pose rhino tubist.

The source is the T-pose mesh `assets/models/rhino/rhino-tpose.glb`. The rebuild uses loop edges,
retopology, and extra bones to fix the arm and wrist twist. The T-pose arms stand out to the sides
as the arms of the T-pose bear, so this script runs the steps of `bear_arms.py` with the settings
of the rhino (`RHINO`):

1. Import the mesh and Merge by Distance.
2. Replace the faces of each arm from the shoulder line to the wrist with a quad tube, wrap it onto
   the source arm, bridge it to the trunk and to the paw, beautify the bridge triangles, collapse
   the thin faces at the cut loops, and even the band of each wrist (`bear_arms.py`).
3. Give the new arm faces a UV layout, bake the fur color of the source arm, and transfer the
   custom normals of the source surface. The rhino needs no flatter inner upper arm: its arms
   stand out level from the trunk.
4. Keep the length and the cross-section of the arms (`factor` 1, `slim` 1), put the arm image in
   a strip of the atlas, and write `rhino-tpose-arms.glb`.
5. Add the studio skeleton with the arm segments and the helpers, parent with automatic weights,
   and paint the fixes with the Weight Paint tools.
6. Write the weights for `paintedWeights` of the config (`rhino-tpose-weights.json`).

The faces of the paws, the trunk, the legs, and the head stay the faces of the source mesh. The
source file, `rhino-tpose.glb`, stays unchanged.

Run it in a terminal from the root of the tree:

    Blender -b --factory-startup -P tools/blender/rhino_tpose_arms.py -- [<out dir>]

In the live Blender of MCP, `run_steps()` runs one step at a time.
"""

import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def load_bear_arms():
    """Loads `bear_arms.py` from the folder of this script as the module `bear_arms`. It loads
    `elephant_arms.py`, `wind_arms.py`, and `violin_arms.py` in turn."""
    if 'bear_arms' in sys.modules:
        return sys.modules['bear_arms']
    path = os.path.join(HERE, 'bear_arms.py')
    spec = importlib.util.spec_from_file_location('bear_arms', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    sys.modules['bear_arms'] = module
    return module


def load_rhino_arms():
    """Loads `rhino_arms.py`, the session of the A-pose rhino, from the folder of this script as
    the module `rhino_arms`, for its paint fixes of the paws and the neck."""
    if 'rhino_arms' in sys.modules:
        return sys.modules['rhino_arms']
    path = os.path.join(HERE, 'rhino_arms.py')
    spec = importlib.util.spec_from_file_location('rhino_arms', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    sys.modules['rhino_arms'] = module
    return module


ba = load_bear_arms()
ra = load_rhino_arms()
wa = ba.wa
va = ba.va

#: The settings of the rhino, with the keys of `ANIMALS` of `violin_arms.py` and `wind_arms.py`,
#: in the units of the studio (1 unit from the soles to the ear tips). They are the settings of the
#: bear (`bear_arms.py` at e34f47cba), moved to the arm root of the rhino: the arm is free of the
#: trunk beyond |x| 0.19, from y 0.57 to 0.67. The upper arm is only 0.105 units long, so the
#: shoulder cut stands at 0.4 of it (x 0.202), out of the joined root, as on the A-pose rhino
#: (`rhino_arms.py`): at 0.2 (x 0.181), the cut loop runs over the trunk. The rings of the upper
#: arm follow the cut. The forearm is 0.11 units long, so it has 4 inner rings. The paint boxes
#: take the side of the trunk under the arm and the arm root, and the head bone leaves the
#: shoulders below the head at y 0.7. `neck` and `paw` are the fixes of `rhino_arms.py`
#: (`step_neck()` and `step_paw()`), with the neck box above the shoulders of the T-pose, and
#: `chest` the box of `step_chest()`.
RHINO = {
    'config': 'tools/mesh-rigs/rhino.json',
    'source': 'assets/models/rhino/rhino-tpose.glb',
    'folder': 'assets/models/rhino',
    'factor': 1.0,
    'slim': (1.0, 1.0),
    'cut': {'shoulder': 0.4, 'tilt': 0.0, 'wrist': 0.3},
    'zone': {'x': 0.12, 'radius': 0.12},
    'gap': 0.022,
    'wristGap': 0.016,
    'upper': (0.55, 0.7, 0.85),
    'fore': 4,
    'texture': 512,
    'faces': 900,
    'paint': {'trunk': {'x': 0.15, 'y': (0.4, 0.7)}, 'root': {'x': (0.13, 0.23),
                                                                'y': (0.55, 0.7)},
              'neck': {'x': 0.12, 'y': 0.69}, 'paw': 0.004, 'chest': {'x': 0.09, 'y': 0.5}},
    'head': {'x': 0.12, 'y': 0.7},
    'fingers': 0.5,
}

#: The name of the session. It gives the names of the files `rhino-tpose-arms.glb` and
#: `rhino-tpose-weights.json`, apart from the files of `rhino_arms.py`.
ANIMAL = 'rhino-tpose'


#: The longest projection of the wrap of a tube vertex onto the source arm, in units of the studio.
WRAP_LIMIT = 0.03


def step_wrap(s):
    """Puts the tube vertices on the surface of the source arm as `step_wrap()` of
    `violin_arms.py` does, with the projection limited to `WRAP_LIMIT`. The Shrinkwrap projects
    each vertex along its normal in both directions. Near the root, a vertex under the arm of the
    rhino went 0.13 units down onto the side of the trunk, and four faces of the first ring
    stretched into a long shard from the arm root to the trunk."""
    mesh = s.mesh
    s.source.hide_set(False)
    group = va.part_group(mesh, 'retopo', (va.PART['tube'], va.PART['tube'] + 10))
    mod = mesh.modifiers.new('wrap', 'SHRINKWRAP')
    mod.target = s.source
    mod.wrap_method = 'PROJECT'
    mod.use_project_x = mod.use_project_y = mod.use_project_z = False
    mod.use_negative_direction = True
    mod.use_positive_direction = True
    mod.cull_face = 'OFF'
    mod.project_limit = s.units(WRAP_LIMIT)
    mod.vertex_group = group.name
    va.apply_modifier(mesh, mod)
    mesh.vertex_groups.remove(mesh.vertex_groups['retopo'])
    s.source.hide_set(True)


def step_clean_cut(s):
    """Collapses the thin faces at the cut loops (Collapse Edges), after the cuts and before the
    wrap, as `clean_wrist_cut()` of `polar_bear_arms.py` at cbc8db5e4 does: while a face at a
    loop has a corner below the angle of `wind_arms.py` and its shortest edge lies along the loop,
    that edge collapses to its middle.

    The clean of `wind_arms.py` collapses the shortest loop edge of each thin face at a loop. The
    arms of the rhino mesh have many long thin faces, so each collapse made new thin faces, the
    clean stopped at its limit of 200 collapses, and the root of each arm broke into shards. Gives
    the number of collapsed edges."""
    import math

    import bmesh
    bpy = va.bpy
    mesh = s.mesh
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(mesh.data)
    part = bm.verts.layers.int['arm_part']
    loops = {va.PART[c] + off for c in ('shoulder', 'wrist') for off in (0, 10)}
    count = 0
    for _ in range(200):
        edge = None
        for f in bm.faces:
            if min(math.degrees(c.calc_angle()) for c in f.loops) >= wa.CUT_ANGLE:
                continue
            short = min(f.edges, key=lambda e: e.calc_length())
            codes = {p[part] for p in short.verts}
            if len(codes) == 1 and codes <= loops:
                edge = short
                break
        if edge is None:
            break
        bmesh.ops.collapse(bm, edges=[edge], uvs=True)
        count += 1
    bmesh.update_edit_mesh(mesh.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    return count


def step_chest(s):
    """Paints one more fix on the trunk with the Weight Paint tools: Remove From Group of the
    clavicles and the arm bones on the vertices inside |x| `chest.x` and on the vertices below the
    height `chest.y`. The automatic weights of the T-pose spread each clavicle from y 0.39 up to
    0.80 and in to the middle line, so faces of the chest with a clavicle weight folded in each
    play sample. A vertex with no weight left takes the chest (Assign). Gives the number of
    vertices."""
    bpy = va.bpy
    mesh, fr, rule = s.mesh, s.fr, s.spec['paint']['chest']

    def inside(p):
        return (abs(p.co.x) / fr.height < rule['x']
                or (p.co.z - fr.floor) / fr.height < rule['y'])

    chosen = [p.index for p in mesh.data.vertices if inside(p)]
    va.paint_mode(mesh, inside)
    va.remove_from(mesh, ['clavicle_L', 'clavicle_R'] + va.arm_groups())
    bpy.ops.object.mode_set(mode='OBJECT')
    empty = [i for i in chosen if not any(g.weight > 0 for g in mesh.data.vertices[i].groups)]
    if empty:
        mesh.vertex_groups['chest'].add(empty, 1.0, 'REPLACE')
    va.paint_mode(mesh, inside)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='BONE_DEFORM', lock_active=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    mesh.data.use_paint_mask_vertex = False
    return len(chosen)


def step_weights(s):
    """Writes the weights file as `step_weights()` of `wind_arms.py` does, with a note that names
    this script."""
    count = wa.step_weights(s)
    path = os.path.join(s.out_dir, s.animal + '-weights.json')
    with open(path) as f:
        data = json.load(f)
    data['note'] = ('Weights of the T-pose rhino with the rebuilt arms, painted in Blender on '
                    '2026-10-28 (tools/blender/rhino_tpose_arms.py): automatic weights and Weight '
                    'Paint fixes. Points in the units of the rig config.')
    with open(path, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    return count


#: The steps of the session: the steps of `bear_arms.py`, with the wrap and the clean of the cut
#: loops above, no flatten after the bake, the fixes of the paws, the neck, and the chest after
#: the paint, and the weights file above.
STEPS = tuple(
    {wa.step_weights: step_weights, va.step_wrap: step_wrap}.get(step, step)
    for step in ba.STEPS
    if step is not ba.ea.step_flatten and step.__name__ != 'step_clean_cut')
STEPS = STEPS[:STEPS.index(wa.step_clean_pit)] + (step_clean_cut,) + STEPS[
    STEPS.index(wa.step_clean_pit):]
STEPS = STEPS[:STEPS.index(ba.step_paint) + 1] + (ra.step_paw, ra.step_neck, step_chest) + STEPS[
    STEPS.index(ba.step_paint) + 1:]


def run_steps(s, first=0, last=len(STEPS)):
    """Runs the steps from `first` up to `last` (not included), and prints the result of each."""
    for step in STEPS[first:last]:
        print('%s: %s' % (step.__name__, step(s)))


def main():
    """Runs the steps of the session and writes the source mesh and the weights into the out dir
    (`assets/models/rhino/` by default)."""
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out_dir = os.path.abspath(argv[0]) if argv else None
    wa.ANIMALS[ANIMAL] = RHINO
    va.clear_scene()
    s = wa.Session(ANIMAL, out_dir)
    run_steps(s)
    print('rhino_tpose_arms: wrote %s-arms.glb and %s-weights.json into %s'
          % (ANIMAL, ANIMAL, s.out_dir))


if __name__ == '__main__':
    main()
