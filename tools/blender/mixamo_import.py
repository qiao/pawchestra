"""Converts a Mixamo file (FBX, GLB, or glTF) into a GLB file in meters (design 4.4, 8.1).

Run it with `pnpm mixamo-import <file> --out <dir>` (`tools/mixamo-import.ts`), or directly:
blender -b --factory-startup --python-exit-code 1 --python mixamo_import.py -- <in> <out.glb>

The script removes the prefix `mixamorig:` (also `mixamorig1:` and similar) from each bone and
from each animation channel, bakes the scale and the turn of the armature object into the bones,
and scales the keys of each bone move by the same factor, so that the moves of the hips are in
meters. Each take of the file becomes one animation, named by its take, or by the file name for a
file of one take. The rest pose of the armature stays as it is: for Mixamo, the T-pose.
"""

import os
import re
import sys

import bpy

PREFIX = re.compile(r'^mixamorig\d*:')
LOG = 'mixamo_import:'


def log(*parts):
    print(LOG, *parts, flush=True)


def fail(message):
    raise SystemExit(f'{LOG} {message}')


def channelbags(action):
    """Gives the channel bags of an action of Blender 4.4 or later (slotted actions)."""
    for layer in action.layers:
        for strip in layer.strips:
            yield from strip.channelbags


def fcurves_of(action):
    for bag in channelbags(action):
        yield from bag.fcurves


def import_file(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == '.fbx':
        bpy.ops.import_scene.fbx(
            filepath=path, automatic_bone_orientation=False, ignore_leaf_bones=False
        )
    elif ext in ('.glb', '.gltf'):
        # The glTF importer puts the keys on the frames of the scene. Mixamo gives 30 frames a
        # second, so the keys stay on frames, and the export keeps their times.
        bpy.context.scene.render.fps = 30
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        fail(f'the file type {ext} is not read: give an FBX, GLB, or glTF file')


def the_armature():
    rigs = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']
    if len(rigs) != 1:
        fail(f'the file has {len(rigs)} armatures: one is necessary')
    return rigs[0]


def strip_prefix(rig):
    renamed = 0
    for bone in rig.data.bones:
        name = PREFIX.sub('', bone.name)
        if name != bone.name:
            bone.name = name
            renamed += 1
    # A rename updates only the channels of the action of the armature. Update each action.
    for action in bpy.data.actions:
        for fc in fcurves_of(action):
            path = re.sub(r'pose\.bones\["mixamorig\d*:', 'pose.bones["', fc.data_path)
            if path != fc.data_path:
                fc.data_path = path
        for bag in channelbags(action):
            for group in bag.groups:
                group.name = PREFIX.sub('', group.name)
    # The vertex groups of a skinned mesh carry the bone names too.
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            for group in obj.vertex_groups:
                group.name = PREFIX.sub('', group.name)
    return renamed


def bake_object_transform(rig):
    """Bakes the scale and the turn of the armature object into its bones, and scales the moves."""
    scale = rig.matrix_world.to_scale()
    if max(scale) - min(scale) > 1e-4 * max(scale):
        fail(f'the armature has a scale that is not uniform: {tuple(scale)}')
    factor = scale[0]
    for action in bpy.data.actions:
        for bag in channelbags(action):
            # The keys of the object itself would bring the baked turn and scale back: an FBX
            # file can key the scale of the armature object in each take.
            for fc in [fc for fc in bag.fcurves if not fc.data_path.startswith('pose.bones[')]:
                bag.fcurves.remove(fc)
        for fc in fcurves_of(action):
            if fc.data_path.startswith('pose.bones[') and fc.data_path.endswith('.location'):
                for key in fc.keyframe_points:
                    key.co[1] *= factor
                    key.handle_left[1] *= factor
                    key.handle_right[1] *= factor
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    for child in rig.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return factor


def clip_name(action, stem, count, rig):
    """Names a clip by its take, or by the file name for a file of one Mixamo take."""
    parts = action.name.split('|')
    if len(parts) == 1:
        # The glTF importer keeps the name of each animation.
        return action.name
    # The FBX importer names a take `<object>|<take>`, and a Mixamo take is `mixamo.com|Layer0`.
    skip = {'', 'mixamo.com', rig.name}
    kept = [p for p in parts[1:] if p not in skip and not p.startswith('Layer')]
    return kept[-1] if kept and count > 1 else stem


def drop_bone_shapes(rig):
    """Removes the meshes that only draw the bones, such as the sphere of the glTF importer."""
    shapes = {pb.custom_shape for pb in rig.pose.bones if pb.custom_shape}
    for obj in shapes:
        bpy.data.objects.remove(obj)
    return len(shapes)


def main():
    args = sys.argv[sys.argv.index('--') + 1 :]
    if len(args) != 2:
        fail('usage: mixamo_import.py -- <in.fbx|in.glb> <out.glb>')
    source, out = args
    stem = os.path.splitext(os.path.basename(source))[0]

    # The factory scene holds a cube, a light, and a camera. The GLB file gets none of them.
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj)
    import_file(source)
    rig = the_armature()
    log('bone shapes removed', drop_bone_shapes(rig))
    renamed = strip_prefix(rig)
    log('bones renamed', renamed)
    factor = bake_object_transform(rig)
    log('scale baked', f'{factor:.6g}')

    actions = [a for a in bpy.data.actions if any(True for _ in fcurves_of(a))]
    names = set()
    for action in actions:
        name = clip_name(action, stem, len(actions), rig)
        while name in names:
            name += '_'
        names.add(name)
        action.name = name
        action.use_fake_user = True
    # Each action plays from its own first key.
    rig.animation_data_create()
    rig.animation_data.action = None
    for track in list(rig.animation_data.nla_tracks):
        rig.animation_data.nla_tracks.remove(track)
    for action in actions:
        start, end = action.frame_range
        log('clip', action.name, f'frames {start:g}-{end:g}')

    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format='GLB',
        export_yup=True,
        export_animations=True,
        export_animation_mode='ACTIONS',
        export_force_sampling=True,
        export_skins=True,
        export_def_bones=False,
        export_reset_pose_bones=True,
        export_rest_position_armature=True,
        export_optimize_animation_size=False,
    )
    log('wrote', out)


main()
