"""Reads a Mixamo-rigged mesh, and writes the inputs of `pnpm rig-mesh` (design 4.4, 8.1).

Run it with `pnpm mixamo-model <file.glb> --out <dir>` (`tools/mixamo-model.ts`), or directly:
blender -b --factory-startup --python-exit-code 1 --python mixamo_model.py -- <in.glb> <out dir>

The input is a GLB file of `pnpm mixamo-import`: one skinned mesh on a Mixamo skeleton, in meters,
with no `mixamorig:` prefix. The script writes three files into the output folder:

- `<name>.glb`: the mesh alone in its rest pose, with its material: the `source` of the rig
  config. Its vertices are the vertices of the skin, so each one gets its painted weights.
- `<name>-joints.json`: the `joints` and the `palm` of the rig config, in the units and the axes
  of the studio (`load_mesh()` of `rig_mesh.py`: 1 unit from the soles to the top, y up, +z
  forward, +x the left side). The right side mirrors the left side. Mixamo has no ears and no
  tail, so the file names them under `missing`, and the rigger adds them.
- `<name>-weights.json`: the file of `paintedWeights`: the studio bones, the place of each vertex
  in the studio units, and its weights. Each Mixamo bone gives its weight to its studio bone
  (`STUDIO_OF`). The forearm weight moves to the twist bone along the forearm, from
  `TWIST_RAMP[0]` to `TWIST_RAMP[1]` of the way to the wrist, because Mixamo has no twist bone.
"""

import json
import os
import re
import sys

import bpy
import numpy as np
from mathutils import Vector

LOG = 'mixamo_model:'
PREFIX = re.compile(r'^mixamorig\d*:')

#: The studio bone of each Mixamo bone of the left side and of the trunk. The right side takes
#: `Right` and `_R`. The thumb moves with the paw, and the other fingers with the finger block.
STUDIO_OF = {
    'Hips': 'hips',
    'Spine': 'spine',
    'Spine1': 'spine1',
    'Spine2': 'chest',
    'Neck': 'neck',
    'Head': 'head',
    'HeadTop_End': 'head',
    'LeftShoulder': 'clavicle_L',
    'LeftArm': 'upper_arm_L',
    'LeftForeArm': 'forearm_L',
    'LeftHand': 'hand_L',
    'LeftUpLeg': 'thigh_L',
    'LeftLeg': 'shin_L',
    'LeftFoot': 'foot_L',
    'LeftToeBase': 'toes_L',
    'LeftToe_End': 'toes_L',
}
for _k in range(1, 5):
    STUDIO_OF[f'LeftHandThumb{_k}'] = 'hand_L'
    for _finger in ('Index', 'Middle', 'Ring', 'Pinky'):
        STUDIO_OF[f'LeftHand{_finger}{_k}'] = 'fingers_L'
for _name, _bone in list(STUDIO_OF.items()):
    if _name.startswith('Left'):
        STUDIO_OF['Right' + _name[4:]] = _bone[:-2] + '_R'

#: The share of the way from the elbow to the wrist where the forearm weight starts to move to the
#: twist bone, and where all of it has moved.
TWIST_RAMP = (0.25, 0.9)

#: The share of the way from the elbow to the wrist at the head of the twist bone, as the configs
#: of the meshes place it.
TWIST_AT = 0.5

#: The order of the studio bones in the weights file (`BONES` of `rig_mesh.py`).
BONES = (
    'root',
    'hips',
    'spine',
    'spine1',
    'chest',
    'neck',
    'head',
    'ear_L',
    'ear_R',
    'clavicle_L',
    'upper_arm_L',
    'forearm_L',
    'forearm_twist_L',
    'hand_L',
    'fingers_L',
    'clavicle_R',
    'upper_arm_R',
    'forearm_R',
    'forearm_twist_R',
    'hand_R',
    'fingers_R',
    'thigh_L',
    'shin_L',
    'foot_L',
    'toes_L',
    'thigh_R',
    'shin_R',
    'foot_R',
    'toes_R',
    'tail',
)


def log(*parts):
    print(LOG, *parts, flush=True)


def fail(message):
    raise SystemExit(f'{LOG} {message}')


def from_blender(v):
    """Converts points from the axes of Blender to the axes of the studio (`rig_mesh.py`)."""
    v = np.asarray(v, float)
    return np.stack([v[..., 0], v[..., 2], -v[..., 1]], axis=-1)


def the_parts():
    """Gives the skinned mesh and the armature. The glTF importer adds a mesh that draws the
    bones (a custom shape), which the script removes first."""
    for rig in [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']:
        for obj in {pb.custom_shape for pb in rig.pose.bones if pb.custom_shape}:
            bpy.data.objects.remove(obj)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    rigs = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']
    if len(meshes) != 1 or len(rigs) != 1:
        fail(
            f'the file has {len(meshes)} meshes and {len(rigs)} armatures: one of each is necessary'
        )
    return meshes[0], rigs[0]


def joint_places(rig, scale, floor):
    """Gives the head of each bone in the studio units, by its name with no prefix."""
    out = {}
    for bone in rig.data.bones:
        world = rig.matrix_world @ bone.head_local
        out[PREFIX.sub('', bone.name)] = (from_blender(world[:]) - [0.0, floor, 0.0]) * scale
    return out


def palm_normal(at):
    """Gives the normal of the left palm from the knuckles: the index lies on the thumb side."""
    along = at['LeftHandMiddle1'] - at['LeftHand']
    across = at['LeftHandPinky1'] - at['LeftHandIndex1']
    n = np.cross(across, along)
    return n / np.linalg.norm(n)


def rounded(v):
    return [round(float(x), 6) for x in v]


def joints_of(at):
    """Gives the `joints` of the rig config from the Mixamo joints, with the left side only."""
    twist = at['LeftForeArm'] + TWIST_AT * (at['LeftHand'] - at['LeftForeArm'])
    tip = at.get('LeftHandMiddle4', at['LeftHandMiddle3'])
    head_top = at.get('HeadTop_End', at['Head'] + 2.0 * (at['Head'] - at['Neck']))
    toe_end = at.get('LeftToe_End', at['LeftToeBase'] + (at['LeftToeBase'] - at['LeftFoot']))
    return {
        'root': {'head': [0, 0, 0], 'tail': [0, 0, 0.09], 'roll': [0, 1, 0]},
        'hips': {'head': rounded(at['Hips']), 'tail': 'spine'},
        'spine': {'head': rounded(at['Spine']), 'tail': 'spine1'},
        'spine1': {'head': rounded(at['Spine1']), 'tail': 'chest'},
        'chest': {'head': rounded(at['Spine2']), 'tail': 'neck'},
        'neck': {'head': rounded(at['Neck']), 'tail': 'head'},
        'head': {'head': rounded(at['Head']), 'tail': rounded(head_top)},
        'clavicle_L': {'head': rounded(at['LeftShoulder']), 'tail': 'upper_arm_L'},
        'upper_arm_L': {'head': rounded(at['LeftArm']), 'tail': 'forearm_L', 'roll': 'palm'},
        'forearm_L': {
            'head': rounded(at['LeftForeArm']),
            'tail': 'forearm_twist_L',
            'roll': 'palm',
        },
        'forearm_twist_L': {'head': rounded(twist), 'tail': 'hand_L', 'roll': 'palm'},
        'hand_L': {'head': rounded(at['LeftHand']), 'tail': 'fingers_L', 'roll': 'palm'},
        'fingers_L': {'head': rounded(at['LeftHandMiddle1']), 'tail': rounded(tip), 'roll': 'palm'},
        'thigh_L': {'head': rounded(at['LeftUpLeg']), 'tail': 'shin_L'},
        'shin_L': {'head': rounded(at['LeftLeg']), 'tail': 'foot_L'},
        'foot_L': {'head': rounded(at['LeftFoot']), 'tail': 'toes_L', 'roll': [0, 1, 0]},
        'toes_L': {'head': rounded(at['LeftToeBase']), 'tail': rounded(toe_end), 'roll': [0, 1, 0]},
    }


def weights_of(mesh, points, at):
    """Gives the weights of the studio bones of each vertex from the skin of the mesh."""
    names = {g.index: PREFIX.sub('', g.name) for g in mesh.vertex_groups}
    columns = {b: i for i, b in enumerate(BONES)}
    weights = np.zeros((len(mesh.data.vertices), len(BONES)))
    unknown = set()
    for v in mesh.data.vertices:
        for g in v.groups:
            name = names.get(g.group, '')
            bone = STUDIO_OF.get(name)
            if bone is None:
                unknown.add(name)
                continue
            weights[v.index, columns[bone]] += g.weight
    for side, prefix in (('L', 'Left'), ('R', 'Right')):
        elbow, wrist = at[f'{prefix}ForeArm'], at[f'{prefix}Hand']
        axis = wrist - elbow
        t = np.clip(((points - elbow) @ axis) / (axis @ axis), 0.0, 1.0)
        share = np.clip((t - TWIST_RAMP[0]) / (TWIST_RAMP[1] - TWIST_RAMP[0]), 0.0, 1.0)
        fore, twist = columns[f'forearm_{side}'], columns[f'forearm_twist_{side}']
        moved = weights[:, fore] * share
        weights[:, fore] -= moved
        weights[:, twist] += moved
    sums = weights.sum(axis=1)
    if np.any(sums <= 0):
        fail(f'{int(np.sum(sums <= 0))} vertices have no weight on a mapped bone')
    return weights / sums[:, None], sorted(unknown)


def export_mesh(mesh, rig, path):
    """Writes the mesh alone in its rest pose, with its material, as a GLB file."""
    for mod in list(mesh.modifiers):
        if mod.type == 'ARMATURE':
            mesh.modifiers.remove(mod)
    world = mesh.matrix_world.copy()
    mesh.parent = None
    mesh.matrix_world = world
    bpy.data.objects.remove(rig)
    mesh.vertex_groups.clear()
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_skins=False,
        export_animations=False,
        export_morph=False,
    )


def main():
    args = sys.argv[sys.argv.index('--') + 1 :]
    if len(args) != 2:
        fail('usage: mixamo_model.py -- <in.glb> <out dir>')
    source, out = args
    name = os.path.splitext(os.path.basename(source))[0]
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj)
    bpy.ops.import_scene.gltf(filepath=source)
    mesh, rig = the_parts()

    # The studio units of `load_mesh()`: the mesh from its lowest to its highest vertex is 1 unit.
    world = np.array([(mesh.matrix_world @ v.co)[:] for v in mesh.data.vertices])
    points = from_blender(world)
    floor, top = points[:, 1].min(), points[:, 1].max()
    scale = 1.0 / (top - floor)
    points = (points - [0.0, floor, 0.0]) * scale
    at = joint_places(rig, scale, floor)
    missing = [
        b
        for b in (
            'Hips',
            'Spine',
            'Spine1',
            'Spine2',
            'Neck',
            'Head',
            'LeftShoulder',
            'LeftArm',
            'LeftForeArm',
            'LeftHand',
            'LeftHandIndex1',
            'LeftHandMiddle1',
            'LeftHandPinky1',
            'LeftUpLeg',
            'LeftLeg',
            'LeftFoot',
            'LeftToeBase',
            'RightForeArm',
            'RightHand',
        )
        if b not in at
    ]
    if missing:
        fail(f'the skeleton has no bones {", ".join(missing)}')
    log('source', len(points), 'vertices', f'{top - floor:.4f} m high, scale {scale:.6f}')

    weights, unknown = weights_of(mesh, points, at)
    if unknown:
        log('bones with no studio bone (their weight is dropped):', ', '.join(unknown))
    used = [i for i in range(len(BONES)) if weights[:, i].max() > 0]
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, f'{name}-weights.json'), 'w') as f:
        json.dump(
            {
                'note': f'Weights of the Mixamo skin of {os.path.basename(source)} '
                '(tools/blender/mixamo_model.py). Points in the units of the rig config.',
                'bones': [BONES[i] for i in used],
                'points': [rounded(p) for p in points],
                'weights': [[round(float(w), 6) for w in row[used]] for row in weights],
            },
            f,
        )
    joints = joints_of(at)
    palm = palm_normal(at)
    with open(os.path.join(out, f'{name}-joints.json'), 'w') as f:
        json.dump(
            {
                'joints': joints,
                'palm': rounded(palm),
                'missing': ['ear_L', 'tail'],
                'note': 'The joints of the Mixamo skeleton in the studio units and axes. Add the '
                'missing joints by hand, and copy the rest into tools/mesh-rigs/<a>.json.',
            },
            f,
            indent=2,
        )
    for bone in ('hips', 'chest', 'head', 'upper_arm_L', 'hand_L', 'thigh_L', 'foot_L'):
        log('joint', bone, joints[bone]['head'])
    log('palm', rounded(palm))
    log('weights:', len(used), 'bones:', ', '.join(BONES[i] for i in used))
    export_mesh(mesh, rig, os.path.join(out, f'{name}.glb'))
    log('wrote', out)


main()
