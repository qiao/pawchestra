"""Gives the flatten step of the arm rebuild (`step_flatten()`), and loads `wind_arms.py` and
`violin_arms.py` for the scripts that load this module.

`bear_arms.py` runs `step_flatten()` after the bake: it makes the inner front of each upper arm a
little flatter where the thick upper arm meets a round belly. The bake casts its rays from 0.006
units out of the tube (`step_bake()` of `violin_arms.py`). A flatten before the bake moves the tube
into the source arm, the rays miss the source, and the bake writes black on the inner upper arms.
After the bake, the flatten moves the vertices and keeps their texels.
"""

import importlib.util
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))


def load_wind_arms():
    """Loads `wind_arms.py` from the folder of this script as the module `wind_arms`."""
    if 'wind_arms' in sys.modules:
        return sys.modules['wind_arms']
    path = os.path.join(HERE, 'wind_arms.py')
    spec = importlib.util.spec_from_file_location('wind_arms', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    sys.modules['wind_arms'] = module
    return module


wa = load_wind_arms()
va = wa.va


def step_flatten(s):
    """Makes the inner front of each upper arm a little flatter, where it meets a round belly
    (`flatten` of the spec).

    The tube vertices of the upper arm from `along[0]` to `along[1]` of its length, whose direction
    from the arm axis lies within `cone` degrees of `dir`, are selected. `dir` is in the axes of the
    studio for the left arm, and the right arm mirrors it. Translate moves them `move` units toward
    the arm axis, with Proportional Editing (Smooth falloff, Connected Only) of the size `size`, so
    that the near rings follow a part of the move. The arm keeps a round outline with no dent.
    Gives the number of the selected vertices.
    """
    spec = s.spec.get('flatten')
    if not spec:
        return 0
    mesh = s.mesh
    bpy.context.view_layer.objects.active = mesh
    if mesh.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    cone = math.cos(math.radians(spec['cone']))
    count = 0
    for side, off in ((1, 0), (-1, 10)):
        # The edit mode of the other side makes new mesh data, so read the codes again.
        attr = mesh.data.attributes['arm_part'].data
        a, e, _, _ = va.arm_line(s, side)
        u = (e - a).normalized()
        x, y, z = spec['dir']
        inner = Vector((x * side, -z, y))
        inner = (inner - u * inner.dot(u)).normalized()
        for p in mesh.data.vertices:
            rel = p.co - a
            along = rel.dot(u) / (e - a).length
            radial = rel - u * rel.dot(u)
            p.select = (attr[p.index].value == va.PART['tube'] + off
                        and spec['along'][0] <= along <= spec['along'][1]
                        and radial.normalized().dot(inner) >= cone)
            count += p.select
        mesh.data.update()
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.transform.translate(value=tuple(-inner * s.units(spec['move'])),
                                    orient_type='GLOBAL', use_proportional_edit=True,
                                    proportional_edit_falloff='SMOOTH',
                                    proportional_size=s.units(spec['size']),
                                    use_proportional_connected=True)
        bpy.ops.mesh.select_all(action='DESELECT')
        bpy.ops.object.mode_set(mode='OBJECT')
    return count
