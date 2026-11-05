"""Shows the pose that the app draws for a player in Blender (design 4.4, "Hand rig").

`pnpm pose-preview <role>` writes the pose of each moment: the turn and the head of each bone of
the skin and the weight of each morph target, in the axes and the units of the `.blend`.
`load_preview()` imports the export `<animal>.rig.glb` as the collection `app_preview`, beside
the rig. The GLB file has the bind as its rest and the morph targets of the app, so the mesh of
the preview skins from the bind as the app does. One Action holds one key for each moment, with a
timeline marker of the name of the moment. The faces are flat, and a sun light comes from the
direction of the key light of the stage. `refresh_preview()` exports the current state of the
open file into a temporary folder, with no save of the file, and imports it again. The Action,
the markers, the frame, and the view stay. `fold_colors()` colors each face whose normal turns
more than an angle from its bind normal, moved by the mean skin turn of its corners (the test of
`pnpm fold-probe`). A save of the file removes the preview first and adds it back after, so the
`.blend` never holds it.

In a live Blender, call only the functions below. No function resets Blender or loads a file:

    import sys
    sys.path.insert(0, '<repo>/tools/blender')
    import studio_preview as sp
    sp.load_preview('cat', '<repo>/scratch/pose-preview/violist.json')
    sp.refresh_preview()
    sp.fold_colors(True)
    sp.clear_preview()

The check runs headless on a copy of the `.blend`, with a file of `pnpm pose-preview --skin`. It
compares the vertices of the preview with the skins of the file, and `--move <vertex>` moves one
vertex of the rig mesh, refreshes, and prints the vertices of the preview that move:

    blender -b --factory-startup <copy.blend> --python tools/blender/studio_preview.py -- \
        --check <pose.json> [--move <vertex>]
"""

import json
import math
import os
import subprocess
import sys
import tempfile
import time

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

#: The repository root.
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

#: The export script of a hand rig.
EXPORT = os.path.join(ROOT, 'tools', 'blender', 'export_rig.py')

#: The names of the collection, the Action, and the objects of the preview.
COLLECTION, ACTION = 'app_preview', 'app_preview'
RIG, MESH, LIGHT = 'app_preview_rig', 'app_preview_mesh', 'app_preview_key'

#: The material of each slot of the export (`fur`, `gloss`), with the roughness of its finish in
#: the app (`FINISHES` of `src/models/mesh.ts`: matte and lacquer).
MATERIALS = {'fur': ('app_preview_fur', 0.85), 'gloss': ('app_preview_gloss', 0.22)}

#: The face attribute of the shown colors: the colors of the export, or the fold color.
COLOR = 'preview_color'

#: The color of a folded face, in linear RGB.
FOLD_COLOR = (1.0, 0.0, 0.8, 1.0)

#: The color of the key light of the app (`KEY_LIGHT.color` of `src/scene/lights.ts`), in sRGB.
KEY_COLOR = '#ffca98'

#: The strength of the sun light, in W/m².
KEY_STRENGTH = 3.0

#: The place of the preview rig with no `at`, in Blender units: beside the rig of the file.
BESIDE = (1.2, 0.0, 0.0)

#: The key in `bpy.app.driver_namespace` of the state of the preview, which a reload of this module
#: keeps.
STATE_KEY = 'zoophony_app_preview'

#: The kinds of data that an import can add.
KINDS = ('objects', 'meshes', 'armatures', 'actions', 'materials', 'images', 'lights')

#: The largest move of a bone head of the rest between two imports, in units, before a warning.
HEAD_LIMIT = 1e-5

#: The cell of the search of the check for the vertex of the app at the bind place of a vertex of
#: the preview, and the largest distance of a pair, in units.
PAIR_CELL, PAIR_LIMIT = 1e-4, 1e-6


def _state():
    """Gives the state of the preview, or `None` with no preview."""
    return bpy.app.driver_namespace.get(STATE_KEY)


def read_pose(path):
    """Reads a file of `pnpm pose-preview`."""
    with open(path) as f:
        pose = json.load(f)
    if pose.get('version') != 1:
        raise RuntimeError(f'{path} is no pose file of version 1 of pnpm pose-preview.')
    return pose


def _collection(scene):
    """Gives the collection of the preview, linked to the scene."""
    col = bpy.data.collections.get(COLLECTION) or bpy.data.collections.new(COLLECTION)
    if col.name not in scene.collection.children:
        scene.collection.children.link(col)
    return col


def _import(glb, col):
    """Imports the GLB file into the collection, and gives the rig and the mesh. The selection
    stays. The Actions of the file go, because the export reads an Action `reference` of the
    `.blend` as the pose of the sheet. The empty of the mesh node and the materials go too."""
    layer = bpy.context.view_layer
    before = {kind: set(getattr(bpy.data, kind)) for kind in KINDS}
    selected = [o for o in layer.objects if o.select_get()]
    active = layer.objects.active
    bpy.ops.import_scene.gltf(
        filepath=glb,
        import_shading='FLAT',
        import_scene_as_collection=False,
        import_select_created_objects=False,
        import_scene_extras=False,
        disable_bone_shape=True,
    )
    for o in layer.objects:
        o.select_set(o in selected)
    layer.objects.active = active
    new = {kind: [d for d in getattr(bpy.data, kind) if d not in before[kind]] for kind in KINDS}
    for action in new['actions']:
        bpy.data.actions.remove(action)
    rigs = [o for o in new['objects'] if o.type == 'ARMATURE']
    meshes = [o for o in new['objects'] if o.type == 'MESH']
    if len(rigs) != 1 or len(meshes) != 1:
        raise RuntimeError(
            f'{glb} gave {len(rigs)} armatures and {len(meshes)} meshes, not 1 and 1.'
        )
    rig, mesh = rigs[0], meshes[0]
    for o in new['objects']:
        if o.type == 'EMPTY':
            bpy.data.objects.remove(o)
            continue
        for c in list(o.users_collection):
            c.objects.unlink(o)
        col.objects.link(o)
    if rig.animation_data:
        for track in list(rig.animation_data.nla_tracks):
            rig.animation_data.nla_tracks.remove(track)
    rig.name, rig.data.name, mesh.name, mesh.data.name = RIG, RIG, MESH, MESH
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.location, pb.rotation_quaternion, pb.scale = (0, 0, 0), (1, 0, 0, 0), (1, 1, 1)
    _materials(mesh, new['materials'])
    return rig, mesh


def _srgb_to_linear(text):
    """Gives the linear RGB of an sRGB color `#rrggbb`."""
    rgb = [int(text[k : k + 2], 16) / 255 for k in (1, 3, 5)]
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]


def _material(name, roughness):
    """Gives a material that shows the face attribute `COLOR` with a roughness of the app."""
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
        nodes = mat.node_tree.nodes
        bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
        node = nodes.new('ShaderNodeAttribute')
        node.attribute_name = COLOR
        mat.node_tree.links.new(node.outputs['Color'], bsdf.inputs['Base Color'])
        bsdf.inputs['Roughness'].default_value = roughness
        bsdf.inputs['Metallic'].default_value = 0.0
    return mat


def _materials(mesh, imported):
    """Gives the mesh the materials of the preview, the face colors of the export as the face
    attribute `COLOR`, and flat faces. The imported materials go."""
    me = mesh.data
    for k, slot in enumerate(me.materials):
        kind = 'gloss' if slot is not None and slot.name.startswith('gloss') else 'fur'
        me.materials[k] = _material(*MATERIALS[kind])
    for mat in imported:
        if mat.users == 0:
            bpy.data.materials.remove(mat)
    corner = me.color_attributes.get('Color')
    colors = np.ones((len(me.polygons), 4))
    if corner is not None:
        values = np.empty(len(me.loops) * 4)
        corner.data.foreach_get('color', values)
        starts = np.empty(len(me.polygons), int)
        me.polygons.foreach_get('loop_start', starts)
        colors = values.reshape(-1, 4)[starts]
    if COLOR not in me.attributes:
        me.attributes.new(COLOR, 'FLOAT_COLOR', 'FACE')
    me.attributes[COLOR].data.foreach_set('color', colors.ravel())
    me['base_colors'] = colors.ravel().tolist()
    me.polygons.foreach_set('use_smooth', [False] * len(me.polygons))


def _light(col, direction):
    """Adds the sun light of the preview: it shines from the direction of the key light of the
    app (`light` of the pose file) onto the player."""
    data = bpy.data.lights.get(LIGHT) or bpy.data.lights.new(LIGHT, 'SUN')
    data.color = _srgb_to_linear(KEY_COLOR)
    data.energy = KEY_STRENGTH
    sun = bpy.data.objects.get(LIGHT) or bpy.data.objects.new(LIGHT, data)
    if sun.name not in col.objects:
        col.objects.link(sun)
    # A sun shines along its -Z axis, so its +Z axis points to the light.
    sun.rotation_mode = 'QUATERNION'
    sun.rotation_quaternion = Vector(direction).normalized().to_track_quat('Z', 'Y')


def _skin_matrices(pose, moment, rig):
    """Gives the matrix of each bone from the rest of the preview (the bind) to the pose of a
    moment, in the axes of the armature: the head of the bone moves to its posed head, and the
    bone turns by the turns of its chain."""
    turns, out = {}, {}
    for name in pose['bones']:
        bone = moment['bones'][name]
        parent = pose['parents'][name]
        turn = (turns[parent] if parent else Quaternion()) @ Quaternion(bone['turn'])
        turns[name] = turn
        bind = rig.data.bones[name].head_local
        out[name] = (
            Matrix.Translation(Vector(bone['head']))
            @ turn.to_matrix().to_4x4()
            @ Matrix.Translation(-bind)
        )
    return out


def _bone_keys(pose, rig):
    """Gives the location and the quaternion of each pose bone in each moment: the basis that
    gives the skin matrix of the bone after the matrix of its parent."""
    keys = {name: [] for name in pose['bones']}
    for moment in pose['moments']:
        skins = _skin_matrices(pose, moment, rig)
        for name in pose['bones']:
            rest = rig.data.bones[name].matrix_local
            parent = pose['parents'][name]
            above = skins[parent] if parent else Matrix.Identity(4)
            location, turn, _ = (
                rest.inverted() @ above.inverted() @ skins[name] @ rest
            ).decompose()
            previous = keys[name][-1][1] if keys[name] else None
            if previous is not None and previous.dot(turn) < 0:
                turn.negate()
            keys[name].append((location, turn))
    return keys


def _curve(channelbag, path, index, frames, values, group=None):
    """Adds an F-curve of constant keys."""
    fc = channelbag.fcurves.new(path, index=index, group_name=group or '')
    fc.keyframe_points.add(len(frames))
    fc.keyframe_points.foreach_set(
        'co', [x for pair in zip(frames, values, strict=True) for x in pair]
    )
    for kp in fc.keyframe_points:
        kp.interpolation = 'CONSTANT'
    fc.update()


def _keys(pose, rig, mesh, first):
    """Writes the Action of the preview: one key of each bone and of each shape key for each
    moment, from the frame `first` on, and assigns it to the rig and to the shape keys."""
    action = bpy.data.actions.get(ACTION) or bpy.data.actions.new(ACTION)
    action.use_fake_user = True
    for layer in list(action.layers):
        action.layers.remove(layer)
    for slot in list(action.slots):
        action.slots.remove(slot)
    rig_slot = action.slots.new(id_type='OBJECT', name='rig')
    key_slot = action.slots.new(id_type='KEY', name='shapes')
    strip = action.layers.new('moments').strips.new(type='KEYFRAME')
    frames = [first + k for k in range(len(pose['moments']))]

    bones = strip.channelbag(rig_slot, ensure=True)
    for name, keys in _bone_keys(pose, rig).items():
        base = f'pose.bones["{name}"]'
        for i in range(3):
            _curve(bones, f'{base}.location', i, frames, [loc[i] for loc, _ in keys], name)
        for i in range(4):
            _curve(bones, f'{base}.rotation_quaternion', i, frames, [q[i] for _, q in keys], name)
    shapes = strip.channelbag(key_slot, ensure=True)
    for block in mesh.data.shape_keys.key_blocks[1:]:
        values = [m['shapes'].get(block.name, 0.0) for m in pose['moments']]
        _curve(shapes, f'key_blocks["{block.name}"].value', 0, frames, values)

    rig.animation_data_create()
    rig.animation_data.action = action
    rig.animation_data.action_slot = rig_slot
    key = mesh.data.shape_keys
    key.animation_data_create()
    key.animation_data.action = action
    key.animation_data.action_slot = key_slot


def _markers(scene, pose, state):
    """Puts one timeline marker on the frame of each moment, after the markers of the last
    preview go."""
    for name, frame in state.get('markers', []):
        for marker in list(scene.timeline_markers):
            if marker.name == name and marker.frame == frame:
                scene.timeline_markers.remove(marker)
                break
    state['markers'] = []
    for k, moment in enumerate(pose['moments']):
        scene.timeline_markers.new(moment['name'], frame=state['first'] + k)
        state['markers'].append((moment['name'], state['first'] + k))


def _build(state):
    """Imports the GLB file of the state, and adds its keys, markers, light, and colors."""
    scene = bpy.context.scene
    pose = read_pose(state['pose'])
    col = _collection(scene)
    rig, mesh = _import(state['glb'], col)
    missing = [b for b in pose['bones'] if b not in rig.data.bones]
    if missing:
        raise RuntimeError(f'The GLB file has no bones {missing}.')
    rig.location = state['at']
    _light(col, pose['light'])
    _keys(pose, rig, mesh, state['first'])
    _markers(scene, pose, state)
    heads = {b.name: list(b.head_local) for b in rig.data.bones}
    old = state.get('heads')
    if old:
        moved = max((Vector(heads[n]) - Vector(old[n])).length for n in heads if n in old)
        if moved > HEAD_LIMIT:
            print(
                f'studio_preview: the bind of the bones moved {moved:.5f} units. The pose file is '
                'old: run pnpm studio-body and pnpm pose-preview again.',
                flush=True,
            )
    state['heads'] = heads
    _WEIGHTS.clear()
    if state.get('folds'):
        _paint_folds()


def _remove(keep_action=False):
    """Removes the objects of the preview and their data, and the Action unless `keep_action`."""
    col = bpy.data.collections.get(COLLECTION)
    names = (RIG, MESH, LIGHT)
    for name in names:
        o = bpy.data.objects.get(name)
        if o is not None:
            bpy.data.objects.remove(o)
    for kind in ('meshes', 'armatures', 'lights'):
        data = getattr(bpy.data, kind)
        for name in names:
            if name in data and data[name].users == 0:
                data.remove(data[name])
    for name, _ in MATERIALS.values():
        mat = bpy.data.materials.get(name)
        if mat is not None and mat.users == 0:
            bpy.data.materials.remove(mat)
    if not keep_action:
        action = bpy.data.actions.get(ACTION)
        if action is not None:
            bpy.data.actions.remove(action)
        if col is not None:
            bpy.data.collections.remove(col)


def load_preview(species, pose_json, glb=None, at=BESIDE, first=1):
    """Shows the moments of a pose file of `pnpm pose-preview` on the export of the animal: the
    file `glb` of the pose file by default (`assets/models/<animal>/<animal>.rig.glb`), placed at
    `at`, with the moments from the frame `first` on. Sets the frame to the first moment."""
    path = os.path.abspath(pose_json)
    pose = read_pose(path)
    if species not in (pose['species'], pose['animal']):
        raise RuntimeError(f'{path} holds the {pose["species"]}, not the {species}.')
    clear_preview()
    state = {
        'animal': pose['animal'],
        'pose': path,
        'glb': os.path.abspath(glb or pose['glb']),
        'at': tuple(at),
        'first': int(first),
        'folds': False,
        'angle': 60.0,
        'markers': [],
    }
    bpy.app.driver_namespace[STATE_KEY] = state
    _build(state)
    _handlers(True)
    bpy.context.scene.frame_set(state['first'])
    print(
        f'studio_preview: {len(pose["moments"])} moments of the {pose["species"]} '
        f'({pose["role"]}) from frame {first}: ' + ', '.join(m['name'] for m in pose['moments']),
        flush=True,
    )


def refresh_preview():
    """Exports the current state of the open file into a temporary folder with
    `tools/blender/export_rig.py`, with no save of the file, and shows the new export with the
    same Action, markers, frame, and view. Gives the time in seconds."""
    state = _state()
    if state is None:
        raise RuntimeError('No preview: call load_preview() first.')
    start = time.time()
    scene = bpy.context.scene
    frame = scene.frame_current
    folder = os.path.join(tempfile.gettempdir(), 'zoophony-app-preview', state['animal'])
    os.makedirs(folder, exist_ok=True)
    blend = os.path.join(folder, f'{state["animal"]}.blend')
    glb = os.path.join(folder, f'{state["animal"]}.rig.glb')
    _remove(keep_action=True)
    state['busy'] = True
    try:
        bpy.ops.wm.save_as_mainfile(filepath=blend, copy=True, check_existing=False)
    finally:
        state['busy'] = False
    run = subprocess.run(
        [bpy.app.binary_path, '-b', '--factory-startup', '--python-exit-code', '1',
         '--python', EXPORT, '--', state['animal'], '--blend', blend, '--out', glb],
        capture_output=True, text=True, check=False,
    )  # fmt: skip
    if run.returncode != 0:
        _build(state)
        scene.frame_set(frame)
        errors = [line for line in run.stderr.splitlines() if 'error' in line.lower()]
        raise RuntimeError('\n'.join(errors) or run.stderr[-2000:])
    state['glb'] = glb
    _build(state)
    scene.frame_set(frame)
    took = time.time() - start
    print(f'studio_preview: refreshed from {glb} in {took:.2f} s', flush=True)
    return took


def clear_preview():
    """Removes the preview: its objects, its data, its Action, its markers, its collection, and
    its handlers."""
    state = _state()
    if state is not None:
        _markers(bpy.context.scene, {'moments': []}, state)
    _remove()
    _handlers(False)
    bpy.app.driver_namespace.pop(STATE_KEY, None)


#: The weights of the mesh of the preview (vertices × bones), by the name of its mesh data, made
#: on the first fold test after an import.
_WEIGHTS = {}


def _weights(mesh, rig):
    """Gives the bones and the weights of the mesh of the preview."""
    if mesh.data.name not in _WEIGHTS:
        names = [b.name for b in rig.data.bones]
        column = {g.index: names.index(g.name) for g in mesh.vertex_groups if g.name in names}
        w = np.zeros((len(mesh.data.vertices), len(names)))
        for v in mesh.data.vertices:
            for g in v.groups:
                if g.group in column:
                    w[v.index, column[g.group]] += g.weight
        _WEIGHTS[mesh.data.name] = (names, w / np.maximum(w.sum(axis=1, keepdims=True), 1e-12))
    return _WEIGHTS[mesh.data.name]


def _normals(points, corners):
    """Gives the unit normal of each triangle."""
    a, b, c = (points[corners[:, k]] for k in range(3))
    n = np.cross(b - a, c - a)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)


def fold_faces(angle=60.0):
    """Gives the faces of the mesh of the preview in the current frame whose normal turns more
    than `angle` degrees from its bind normal, moved by the mean skin turn of its corners."""
    rig, mesh = bpy.data.objects.get(RIG), bpy.data.objects.get(MESH)
    if rig is None or mesh is None:
        return np.zeros(0, bool)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    me = mesh.data
    corners = np.empty(len(me.polygons) * 3, int)
    me.polygons.foreach_get('vertices', corners)
    corners = corners.reshape(-1, 3)
    rest = np.empty(len(me.vertices) * 3)
    me.shape_keys.key_blocks[0].data.foreach_get('co', rest)
    bind = _normals(rest.reshape(-1, 3), corners)
    ev = mesh.evaluated_get(depsgraph)
    posed_mesh = ev.to_mesh()
    posed = np.empty(len(posed_mesh.vertices) * 3)
    posed_mesh.vertices.foreach_get('co', posed)
    ev.to_mesh_clear()
    names, w = _weights(mesh, rig)
    pose_rig = rig.evaluated_get(depsgraph)
    turns = np.array(
        [
            np.array(
                pose_rig.pose.bones[n].matrix.to_3x3()
                @ rig.data.bones[n].matrix_local.to_3x3().inverted()
            )
            for n in names
        ]
    )
    vertex = np.einsum('vb,bij->vij', w, turns)
    expected = np.einsum('fij,fj->fi', vertex[corners].mean(axis=1), bind)
    expected /= np.maximum(np.linalg.norm(expected, axis=1, keepdims=True), 1e-12)
    now = _normals(posed.reshape(-1, 3), corners)
    return np.einsum('fi,fi->f', expected, now) < math.cos(math.radians(angle))


def _frame_folds(*_):
    """Colors the folded faces after a frame change, when the fold colors are on."""
    state = _state()
    if state is not None and state.get('folds'):
        _paint_folds()


def _paint_folds():
    """Colors the folded faces of the current frame, or shows the colors of the export when the
    fold colors are off."""
    state = _state()
    mesh = bpy.data.objects.get(MESH)
    if state is None or mesh is None or state.get('busy'):
        return
    me = mesh.data
    colors = np.array(me['base_colors']).reshape(-1, 4)
    if state.get('folds'):
        folded = fold_faces(state['angle'])
        colors[folded] = FOLD_COLOR
        state['folded'] = int(folded.sum())
    me.attributes[COLOR].data.foreach_set('color', colors.ravel())
    me.update()


def fold_colors(on=True, angle=60.0):
    """Turns the fold colors on or off. On, each frame colors each face of the preview whose normal
    turns more than `angle` degrees from its bind normal, moved by the mean skin turn of its
    corners. Gives the number of folded faces in the current frame."""
    state = _state()
    if state is None:
        raise RuntimeError('No preview: call load_preview() first.')
    state['folds'], state['angle'] = bool(on), float(angle)
    _paint_folds()
    return state.get('folded', 0) if on else 0


def _save_pre(*_):
    """Takes the preview out of the file before a save."""
    state = _state()
    if state is None or state.get('busy') or bpy.data.objects.get(RIG) is None:
        return
    state['frame'] = bpy.context.scene.frame_current
    _markers(bpy.context.scene, {'moments': []}, state)
    _remove()
    state['stashed'] = True


def _save_post(*_):
    """Puts the preview back after a save."""
    state = _state()
    if state is None or not state.pop('stashed', False):
        return
    _build(state)
    bpy.context.scene.frame_set(state.get('frame', state['first']))


#: The handlers of the preview: on each save, and on each frame change for the fold colors.
_HANDLERS = (
    ('save_pre', _save_pre),
    ('save_post', _save_post),
    ('frame_change_post', _frame_folds),
)


def _handlers(on):
    """Adds or removes the handlers of the preview. The handlers of an older load of this module
    go too, by their names."""
    for kind, function in _HANDLERS:
        handlers = getattr(bpy.app.handlers, kind)
        for h in list(handlers):
            if getattr(h, '__name__', '') == function.__name__ and h.__module__ == __name__:
                handlers.remove(h)
        if on:
            handlers.append(function)


def _evaluated(rig, mesh):
    """Gives the vertices of the evaluated mesh of the preview in the axes of its armature."""
    ev = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    ev.to_mesh_clear()
    to_rig = np.array(rig.matrix_world.inverted() @ mesh.matrix_world)
    co = co.reshape(-1, 3)
    return co @ to_rig[:3, :3].T + to_rig[:3, 3]


def check(pose_json, move=None):
    """Compares the preview of a file of `pnpm pose-preview --skin` with its skins, in meters, and
    with `move`, moves that vertex of the rig mesh, refreshes, and prints the vertices of the
    preview that move."""
    pose = read_pose(pose_json)
    skin = pose.get('skin')
    if skin is None:
        raise SystemExit(f'{pose_json} has no skins: run pnpm pose-preview with --skin.')
    load_preview(pose['animal'], pose_json, at=(0, 0, 0))
    rig, mesh = bpy.data.objects[RIG], bpy.data.objects[MESH]
    scale = pose['scale']

    # Each vertex of the preview pairs with the vertices of the app at its bind place.
    rest = np.empty(len(mesh.data.vertices) * 3)
    mesh.data.shape_keys.key_blocks[0].data.foreach_get('co', rest)
    binds = np.array(skin['bind']).reshape(-1, 3)
    cells = {}
    for i, p in enumerate(binds):
        cells.setdefault(tuple(np.floor(p / PAIR_CELL).astype(int)), []).append(i)
    pairs = []
    for p in rest.reshape(-1, 3):
        cell = np.floor(p / PAIR_CELL).astype(int)
        near = [
            i
            for d in np.ndindex(3, 3, 3)
            for i in cells.get(tuple(cell + np.array(d) - 1), [])
            if np.linalg.norm(binds[i] - p) < PAIR_LIMIT
        ]
        pairs.append(near)
    unpaired = sum(1 for p in pairs if not p)
    shared = sum(1 for p in pairs if len(p) > 1)
    print(
        f'check: {len(pairs)} vertices of the preview, {len(skin["bind"]) // 3} of the app, '
        f'{unpaired} with no pair, {shared} with more than one',
        flush=True,
    )
    print(
        f'{"moment":10} {"stance":9} {"preview-exact":>14} {"preview-app":>12} {"mean":>9}  worst'
    )
    for k, moment in enumerate(pose['moments']):
        bpy.context.scene.frame_set(pose_first(k))
        seen = _evaluated(rig, mesh)
        exact = np.array(skin['exact'][moment['name']]).reshape(-1, 3)
        app = np.array(skin['app'][moment['name']]).reshape(-1, 3)
        gap_exact = np.array(
            [
                min(np.linalg.norm(seen[v] - exact[i]) for i in p) if p else np.inf
                for v, p in enumerate(pairs)
            ]
        )
        gap_app = np.array(
            [
                min(np.linalg.norm(seen[v] - app[i]) for i in p) if p else np.inf
                for v, p in enumerate(pairs)
            ]
        )
        worst = int(np.argmax(gap_app))
        print(
            f'{moment["name"]:10} {moment["stance"]:9} {gap_exact.max() * scale:14.2e} '
            f'{gap_app.max() * scale:12.2e} {gap_app.mean() * scale:9.2e}  '
            f'vertex {worst} at {np.round(rest.reshape(-1, 3)[worst], 3).tolist()}',
            flush=True,
        )
    if move is not None:
        _move_test(int(move), rig, mesh, scale)


def pose_first(k):
    """Gives the frame of the moment `k` of the preview."""
    return _state()['first'] + k


def _move_test(index, rig, mesh, scale):
    """Moves one vertex of the rig mesh up by 1 cm in all its keys, refreshes, and prints the
    vertices of the preview that move in the first moment."""
    body = next(
        o for o in bpy.data.objects
        if o.type == 'MESH' and o.name != MESH and any(m.type == 'ARMATURE' for m in o.modifiers)
    )  # fmt: skip
    bpy.context.scene.frame_set(pose_first(0))
    rest_before, before = _rest(mesh), _evaluated(rig, mesh)
    lift = Vector((0, 0, 0.01 / scale))
    body.data.vertices[index].co += lift
    for block in body.data.shape_keys.key_blocks if body.data.shape_keys else []:
        block.data[index].co += lift
    took = refresh_preview()
    rig, mesh = bpy.data.objects[RIG], bpy.data.objects[MESH]
    rest_after, after = _rest(mesh), _evaluated(rig, mesh)

    # A new triangulation of a quad can change the order of the split vertices. So each vertex at
    # a bind place of the last import pairs with a vertex at that place, and each vertex at a new
    # place pairs with the nearest vertex at a place that the import lost.
    def at_places(points, places):
        return np.array([np.linalg.norm(places - p, axis=1).min() < PAIR_LIMIT for p in points])

    kept = at_places(rest_after, rest_before)
    lost = np.nonzero(~at_places(rest_before, rest_after))[0]
    partner = np.empty(len(rest_after), int)
    for v in range(len(rest_after)):
        pool = np.arange(len(rest_before)) if kept[v] else lost
        partner[v] = pool[np.argmin(np.linalg.norm(rest_before[pool] - rest_after[v], axis=1))]
    bind_moves = np.linalg.norm(rest_after - rest_before[partner], axis=1) * scale
    moves = np.linalg.norm(after - before[partner], axis=1) * scale
    moved = np.nonzero(moves > 1e-6)[0]
    print(
        f'move: vertex {index} of {body.name} up by 0.01 m; refresh {took:.2f} s; '
        f'{len(moved)} of {len(moves)} vertices of the preview move in the first moment, by '
        f'{moves.max():.4f} m at most (in the bind {bind_moves.max():.4f} m): '
        + ', '.join(f'{v} ({moves[v]:.4f} m)' for v in moved[:8]),
        flush=True,
    )


def _rest(mesh):
    """Gives the vertices of the basis of the mesh of the preview: the bind of the export."""
    rest = np.empty(len(mesh.data.vertices) * 3)
    mesh.data.shape_keys.key_blocks[0].data.foreach_get('co', rest)
    return rest.reshape(-1, 3)


def main():
    """Runs the check of the arguments after `--`."""
    rest = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else []
    if rest[:1] != ['--check'] or len(rest) < 2:
        raise SystemExit('Usage: studio_preview.py -- --check <pose.json> [--move <vertex>]')
    move = rest[rest.index('--move') + 1] if '--move' in rest else None
    check(rest[1], move)


if __name__ == '__main__':
    main()
