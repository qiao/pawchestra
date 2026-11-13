"""The paint fixes of the paws and the neck of the rhino, for `rhino_tpose_arms.py`.

`step_paw()` takes each paw off the wrist helper, and `step_neck()` takes the neck off the
clavicles. Both use the Weight Paint tools and read the boxes of `paint` of the settings of the
session. In the live Blender of MCP, each step runs alone on a session of `rhino_tpose_arms.py`.
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


va = load_elephant_arms().va


def step_paw(s):
    """Paints one more fix on the paws with the Weight Paint tools: Remove From Group of the wrist
    helper and the forearm segments on the vertices of each paw beyond the wrist joint.

    The paw of the rhino is short, so the automatic weights put about half of each paw on the
    wrist helper, which turns only half of the way from the forearm to the paw. The palm and the
    finger tips then left the valves of the tuba (`pnpm wind-grip tubist`). After the fix, the paw
    hangs on the paw and the finger bones, and the wrist rings of the tube keep the helper. A
    vertex with no weight left takes the paw bone (Assign). Gives the number of paw vertices.
    """
    import bmesh

    mesh = s.mesh
    bm = bmesh.new()
    bm.from_mesh(mesh.data)
    part = bm.verts.layers.int['arm_part']
    paw = set()
    for side, off in ((1, 0), (-1, 10)):
        _, _, w, t = va.arm_line(s, side)
        normal = (t - w).normalized()
        start = s.units(s.spec['paint']['paw'])
        for p in va.arm_verts(s, bm, part, off):
            if (p.co - w).dot(normal) > start:
                paw.add(p.index)
    bm.free()
    names = [f'{b}_{side}' for side in 'LR' for b in ('wrist', 'forearm_seg0', 'forearm_seg1',
                                                       'forearm_seg2', 'forearm_seg3')]
    va.paint_mode(mesh, lambda p: p.index in paw)
    va.remove_from(mesh, names)
    bpy.ops.object.mode_set(mode='OBJECT')
    for side, sign in (('L', 1), ('R', -1)):
        empty = [i for i in paw if mesh.data.vertices[i].co.x * sign > 0
                 and not any(g.weight > 0 for g in mesh.data.vertices[i].groups)]
        if empty:
            mesh.vertex_groups[f'hand_{side}'].add(empty, 1.0, 'REPLACE')
    va.paint_mode(mesh, lambda p: p.index in paw)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='BONE_DEFORM', lock_active=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    mesh.data.use_paint_mask_vertex = False
    return len(paw)


def step_neck(s):
    """Paints one more fix on the neck with the Weight Paint tools: Remove From Group of the
    clavicles and the arm bones on the vertices above the height `neck.y` and inside |x|
    `neck.x`. The automatic weights spread the clavicles up the neck to the chin, so that the chin
    moved with the arms, and the head height H of the body fell, which moved each hold of the
    tuba. A vertex with no weight left takes the neck (Assign). Gives the number of vertices."""
    mesh, fr, rule = s.mesh, s.fr, s.spec['paint']['neck']

    def inside(p):
        return (abs(p.co.x) / fr.height < rule['x']
                and (p.co.z - fr.floor) / fr.height > rule['y'])

    chosen = [p.index for p in mesh.data.vertices if inside(p)]
    names = ['clavicle_L', 'clavicle_R'] + va.arm_groups()
    va.paint_mode(mesh, inside)
    va.remove_from(mesh, names)
    bpy.ops.object.mode_set(mode='OBJECT')
    empty = [i for i in chosen if not any(g.weight > 0 for g in mesh.data.vertices[i].groups)]
    if empty:
        mesh.vertex_groups['neck'].add(empty, 1.0, 'REPLACE')
    va.paint_mode(mesh, inside)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='BONE_DEFORM', lock_active=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    mesh.data.use_paint_mask_vertex = False
    return len(chosen)
