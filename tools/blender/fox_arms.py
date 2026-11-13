"""Gives the step that keeps a share of the weight of each finger bone (`step_fingers()`).

`arm_rebuild.py` runs it after the paint, as the rule `weights.fingers` of a rig config does for
rule weights. With the full finger weights of the automatic weights, the curl of the fingers at
rest folds the faces of the paws.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cat_arms as ca  # noqa: E402

va = ca.va


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
