"""Starts the hand rig of a studio body (design 4.4, "Hand rig") with the conventions of the studio.

    blender -b --factory-startup --python tools/blender/studio_armature.py -- <animal> \
        --out <file.blend> [--source <glb>] [--auto-weights]
    blender -b --factory-startup --python tools/blender/studio_armature.py -- --drive <file.blend>
    blender -b --factory-startup --python tools/blender/studio_armature.py -- --rolls <file.blend>

The mesh of a hand rig is the source of truth. `add_surface()` runs on that mesh, also in a live
Blender: it gives each face the color of the base color texture of the source (a GLB file or an
image file) through the UVs of the mesh (`face_colors()` and `palette()` of `rig_mesh.py`), adds a
gloss fan on each eye unless `eye_fans` is false, and makes the nose gloss (`features()`,
`add_eye_shells()`). After this one run, the colors live in the face attributes `color` and
`color_base`, and a person edits them in Blender.

The first form above starts a new species from `tools/mesh-rigs/<animal>.json`: the mesh of the
source (`source` of the config, or `--source`) in the units of the studio with `add_surface()`, the
armature in the T-pose at the joints of the config with the arm segments and the helpers
(`joints_of()`, `segment_joints()`) and the rolls of `frame()`, and the Action `bind` of the seat
rules of the config (`bind_turns()`). With `--auto-weights`, the mesh takes the automatic weights of
Blender, at most four bones for each vertex. `--drive` keys the arm segments and the helpers of the
Action `bind` by the rule of the app, and `--rolls` gives each bone the roll of its hint. The
command line runs headless only. In a live Blender, import this module and call `add_surface()`,
`drive_segments()`, `fix_rolls()`, `set_weight_row()` (one vertex), and `ring_spread()` (the
shares of the weights across each edge ring of a limb).
"""

import json
import os
import struct
import sys
import tempfile

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

#: The largest number of bones of a vertex (`STUDIO_INFLUENCES` of `src/models/studio-format.ts`).
INFLUENCES = 4

#: The repository root.
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

#: The rig script whose pure functions this module and `export_rig.py` share.
RIG_MESH = os.path.join(ROOT, 'tools', 'blender', 'rig_mesh.py')

#: The map of a point from the axes of Blender to the axes of the studio (`from_blender()`).
TO_STUDIO = np.array([[1.0, 0, 0], [0, 0, 1], [0, -1, 0]])

#: The bones whose roll hint is up (+Z in Blender). The other bones point forward or to the palm.
UP_BONES = ('root', 'foot_L', 'foot_R', 'toes_L', 'toes_R', 'tail', 'tail_tip', 'jaw')

#: The stems of the bones whose roll hint is the palm.
PALM_STEMS = ('upper_arm', 'forearm', 'forearm_twist', 'hand', 'fingers', 'elbow', 'wrist')

#: The bones of a body with arm segments that hold no vertex: the pose code turns them, and they
#: drive the segments (`ARM_SEGMENT_BONES` of `src/models/studio-format.ts`).
DRIVERS = ('root',) + tuple(
    f'{b}_{s}' for s in 'LR' for b in ('upper_arm', 'forearm', 'forearm_twist')
)


def rig_mesh_lib(bones=None):
    """Loads the functions of `rig_mesh.py` with no run of its main step. `bones` sets the bone
    list of the functions that read `BONES`, in the order of `STUDIO_BONES`."""
    with open(RIG_MESH) as f:
        source = f.read().rstrip()
    if not source.endswith('\nmain()'):
        raise SystemExit(f'{RIG_MESH} does not end with main().')
    names = {'__name__': 'rig_mesh_lib', '__file__': RIG_MESH}
    exec(compile(source[: -len('main()')], RIG_MESH, 'exec'), names)
    if bones is not None:
        names['BONES'] = tuple(bones)
    return names


def studio_order(rm):
    """Gives each bone that a studio body can have, in the order of `STUDIO_BONES` with no eyes."""
    return rm['BONES'] + (rm['TAIL_TIP'], rm['JAW']) + rm['segment_bones']()


def config_bones(rm, config):
    """Gives the bones of the rig of a config, as `main()` of `rig_mesh.py` adds them."""
    extra = tuple(b for b in (rm['TAIL_TIP'], rm['JAW']) if b in config['joints'])
    return rm['BONES'] + extra + (rm['segment_bones']() if 'armSegments' in config else ())


def load_config(species):
    """Reads `tools/mesh-rigs/<species>.json`."""
    with open(os.path.join(ROOT, 'tools', 'mesh-rigs', f'{species}.json')) as f:
        return json.load(f)


def rig_property(rig, name):
    """Gives a custom property of the armature object, or of its armature data when the object has
    none, as plain Python values."""
    value = rig.get(name, rig.data.get(name))
    if hasattr(value, 'to_dict'):
        return value.to_dict()
    return value.to_list() if hasattr(value, 'to_list') else value


def hint(rig, name):
    """Gives the roll hint of a bone in Blender axes: up, the palm of its side, or forward."""
    if name in UP_BONES:
        return np.array([0.0, 0, 1])
    stem = name[:-2].split('_seg')[0] if name[-2:] in ('_L', '_R') else name
    if stem in PALM_STEMS:
        palm = np.array(rig_property(rig, 'palm'), float)
        return palm * [-1, 1, 1] if name.endswith('_R') else palm
    return np.array([0.0, -1, 0])


def m64(m):
    """Gives a matrix of `mathutils` as a numpy array of 64-bit floats."""
    return np.array([list(row) for row in m], float)


def quat_matrix(q):
    """Gives the rotation matrix of a quaternion (w, x, y, z) of Blender, normalized first."""
    w, x, y, z = np.asarray(q, float) / np.linalg.norm(q)
    return np.array(
        [
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
        ]
    )


def pose_worlds(rig):
    """Gives the world matrix of each bone in the current pose, in 64-bit floats and Blender axes,
    as Blender composes it: the parent, the rest of the bone in its parent, then the pose values."""
    out = {}

    def world(bone):
        if bone.name not in out:
            pb = rig.pose.bones[bone.name]
            basis = np.eye(4)
            basis[:3, :3] = quat_matrix(pb.rotation_quaternion) * np.array(pb.scale, float)
            basis[:3, 3] = np.array(pb.location, float)
            rest = m64(bone.matrix_local)
            if bone.parent:
                rest = world(bone.parent) @ np.linalg.inv(m64(bone.parent.matrix_local)) @ rest
            out[bone.name] = rest @ basis
        return out[bone.name]

    for bone in rig.data.bones:
        world(bone)
    return out


def action_worlds(rig, action):
    """Gives the world matrix of each bone in an Action at its first frame (`pose_worlds()`), or
    in the rest pose with no Action. The current pose stays."""
    saved = {
        pb.name: (pb.location.copy(), pb.rotation_quaternion.copy(), pb.scale.copy())
        for pb in rig.pose.bones
    }
    for pb in rig.pose.bones:
        pb.location, pb.rotation_quaternion, pb.scale = (0, 0, 0), (1, 0, 0, 0), (1, 1, 1)
    if action is not None:
        rig.pose.apply_pose_from_action(action, evaluation_time=action.frame_range[0])
    out = pose_worlds(rig)
    for pb in rig.pose.bones:
        pb.location, pb.rotation_quaternion, pb.scale = saved[pb.name]
    return out


def sheet_worlds(rig):
    """Gives the world matrices of the pose of the sheet: the Action `reference`, or the rest."""
    return action_worlds(rig, bpy.data.actions.get('reference'))


def studio_turns(worlds, sheet):
    """Gives the world turn of each bone from the pose of the sheet, and the heads of the sheet,
    in the axes of the studio."""
    turns = {n: TO_STUDIO @ w[:3, :3] @ (TO_STUDIO @ sheet[n][:3, :3]).T for n, w in worlds.items()}
    heads = {n: TO_STUDIO @ s[:3, 3] for n, s in sheet.items()}
    return turns, heads


def driven_segments(rig, rm, worlds, sheet):
    """Gives the world turn of each arm segment and helper of a pose by the rule of the app
    (`driven_turns()` of `rig_mesh.py`), in the axes of the studio, or none with no segments."""
    if 'upper_arm_seg0_L' not in rig.data.bones:
        return {}
    return rm['driven_turns'](*studio_turns(worlds, sheet))


def set_world_turns(rig, turns, sheet, key_frame=None):
    """Sets the pose of each bone of `turns` (world turns in the axes of the studio from the pose
    of the sheet), with the parents first, and keys it at `key_frame` when it is given."""
    for name in [b.name for b in rig.data.bones if b.name in turns]:
        bone = rig.data.bones[name]
        target = TO_STUDIO.T @ turns[name] @ TO_STUDIO @ sheet[name][:3, :3]
        rest = m64(bone.matrix_local)[:3, :3]
        if bone.parent:
            parent = pose_worlds(rig)[bone.parent.name][:3, :3]
            rest = parent @ m64(bone.parent.matrix_local)[:3, :3].T @ rest
        pb = rig.pose.bones[name]
        pb.location, pb.scale = (0, 0, 0), (1, 1, 1)
        pb.rotation_quaternion = Matrix((rest.T @ target).tolist()).to_quaternion()
        if key_frame is not None:
            for path in ('location', 'rotation_quaternion', 'scale'):
                pb.keyframe_insert(path, frame=key_frame)


def drive_segments(rig, key_frame=None):
    """Turns the arm segments and the helpers of the current pose by the rule of the app, and keys
    them at `key_frame` when it is given. Run it after each change of the arms of the bind."""
    rm = rig_mesh_lib()
    sheet = sheet_worlds(rig)
    set_world_turns(rig, driven_segments(rig, rm, pose_worlds(rig), sheet), sheet, key_frame)


def fix_rolls(rig):
    """Gives each bone the roll of its hint (`hint()`). Run it before the bind, because a new roll
    changes the turn that each key of an Action gives."""
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for eb in rig.data.edit_bones:
        eb.align_roll(Vector(hint(rig, eb.name).tolist()))
    bpy.ops.object.mode_set(mode='OBJECT')


def set_weight_row(ob, index, row):
    """Replaces all weights of the vertex `index` of the mesh `ob` with `row` ({bone: weight}):
    the `INFLUENCES` largest weights, normalized to a sum of 1. The groups of other bones lose the
    vertex. Each bone must be a deform bone of the armature of the mesh. Gives the written row.
    Safe in a live Blender, in Object Mode."""
    if ob.mode == 'EDIT':
        raise RuntimeError(
            'Leave Edit Mode first: the vertex groups of an edit mesh do not change.'
        )
    rig = ob.find_armature()
    kept = sorted(((n, float(w)) for n, w in row.items() if w > 0), key=lambda p: -p[1])
    kept = kept[:INFLUENCES]
    total = sum(w for _, w in kept)
    bad = [
        n
        for n, _ in kept
        if rig is None or n not in rig.data.bones or not rig.data.bones[n].use_deform
    ]
    if total <= 0 or bad:
        raise ValueError(f'The row {row} has no positive weight, or no deform bones {bad}.')
    index = int(index)
    # The list of the groups of the vertex is copied first: a removal changes `v.groups`.
    old = [g.group for g in ob.data.vertices[index].groups]
    for group in old:
        ob.vertex_groups[group].remove([index])
    for name, weight in kept:
        group = ob.vertex_groups.get(name) or ob.vertex_groups.new(name=name)
        group.add([index], weight / total, 'REPLACE')
    ob.data.update()
    return {name: weight / total for name, weight in kept}


#: The share of the twist of the forearm (from the forearm to the paw) that each bone of the left
#: arm takes in the app (`poseSegments()` of `src/models/studio-rig.ts`): the segment k takes
#: (k + 0.5) / 4, the wrist helper and the paw all, the twist bone of a body with no segments
#: half (`TWIST_SHARE`). Each other bone takes none.
FORE_TWIST = {
    **{f'forearm_seg{k}': (k + 0.5) / 4 for k in range(4)},
    'forearm_twist': 0.5,
    'wrist': 1.0,
    'hand': 1.0,
    'fingers': 1.0,
}

#: The share of the roll of the upper arm from the chest that each bone of the arm takes in the
#: app: the segment k takes (k + 0.5) / 4, and the elbow helper and each bone below it all.
UPPER_ROLL = {
    **{f'upper_arm_seg{k}': (k + 0.5) / 4 for k in range(4)},
    'upper_arm': 1.0,
    'elbow': 1.0,
    'forearm': 1.0,
    **{f'forearm_seg{k}': 1.0 for k in range(4)},
    'forearm_twist': 1.0,
    'wrist': 1.0,
    'hand': 1.0,
    'fingers': 1.0,
}

#: The limb parts of `ring_spread()`: the bone at the start of the part, the bone at its end, and
#: the share of the twist of each bone.
LIMB_PARTS = {
    'upper_arm': ('upper_arm', 'forearm', UPPER_ROLL),
    'forearm': ('forearm', 'hand', FORE_TWIST),
}


def ring_spread(ob, limb, along=0.5):
    """Prints, for each edge ring of a limb of the mesh `ob` in the rest, from the joint at its
    start (0) to the joint at its end (1), the mean and the spread (the largest less the smallest
    value) across the ring of three shares of each vertex: the twist share (the share of the twist
    of the part that the weights of the vertex follow in the app, `FORE_TWIST` and `UPPER_ROLL`),
    the elbow share, and the wrist share (the weights of the helpers). `limb` is `upper_arm_<side>`,
    `forearm_<side>`, or `arm_<side>` for both. A ring is a loop of the edges of the limb that turn
    from its axis by more than `along` in cosine. Gives the rows. Safe in a live Blender."""
    side = limb[-1]
    parts = ('upper_arm', 'forearm') if limb[:-2] == 'arm' else (limb[:-2],)
    if side not in 'LR' or any(p not in LIMB_PARTS for p in parts):
        raise ValueError(f'{limb} is no limb: upper_arm_<side>, forearm_<side>, or arm_<side>.')
    if ob.mode == 'EDIT':
        ob.update_from_editmode()
    rig = ob.find_armature()
    me = ob.data
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    names = {g.index: g.name for g in ob.vertex_groups}
    weights = [{names[g.group]: g.weight for g in v.groups if g.weight > 0} for v in me.vertices]
    weights = [{n: w / sum(row.values()) for n, w in row.items()} for row in weights]
    edges = np.empty(len(me.edges) * 2, int)
    me.edges.foreach_get('vertices', edges)
    edges = edges.reshape(-1, 2)
    arm = {n for n in rig.data.bones.keys() if n.endswith(f'_{side}')}

    rows = []
    for part in parts:
        start, end, shares = LIMB_PARTS[part]
        head = np.array(rig.data.bones[f'{start}_{side}'].head_local)
        axis = np.array(rig.data.bones[f'{end}_{side}'].head_local) - head
        length = np.linalg.norm(axis)
        axis = axis / length
        t = (co - head) @ axis / length
        radius = np.linalg.norm((co - head) - np.outer((co - head) @ axis, axis), axis=1)
        on = np.array(
            [
                -0.05 <= t[v] <= 1.05
                and radius[v] < 0.6 * length
                and sum(w for n, w in weights[v].items() if n in arm) > 0.5
                for v in range(len(co))
            ]
        )
        way = co[edges[:, 1]] - co[edges[:, 0]]
        across = np.abs(way @ axis) < along * np.linalg.norm(way, axis=1)
        links = {}
        for a, b in edges[across & on[edges[:, 0]] & on[edges[:, 1]]].tolist():
            links.setdefault(a, []).append(b)
            links.setdefault(b, []).append(a)
        seen, rings = set(), []
        for first in links:
            if first in seen:
                continue
            ring, stack = [], [first]
            seen.add(first)
            while stack:
                v = stack.pop()
                ring.append(v)
                for u in links[v]:
                    if u not in seen:
                        seen.add(u)
                        stack.append(u)
            if len(ring) >= 6:
                rings.append(sorted(ring))
        rings.sort(key=lambda r: t[r].mean())

        twist = [sum(w * shares.get(n[:-2], 0.0) for n, w in row.items()) for row in weights]
        print(f'ring_spread {part}_{side}: {len(rings)} rings, mean and spread of each share')
        print(f'{"t":>6} {"n":>3}   twist spread   elbow spread   wrist spread   twist low/high')
        for ring in rings:
            values = {
                'twist': np.array([twist[v] for v in ring]),
                'elbow': np.array([weights[v].get(f'elbow_{side}', 0.0) for v in ring]),
                'wrist': np.array([weights[v].get(f'wrist_{side}', 0.0) for v in ring]),
            }
            row = {
                'part': part,
                't': float(t[ring].mean()),
                'vertices': ring,
                **{k: (float(x.mean()), float(np.ptp(x))) for k, x in values.items()},
                'low': ring[int(np.argmin(values['twist']))],
                'high': ring[int(np.argmax(values['twist']))],
            }
            rows.append(row)
            cells = '   '.join(f'{row[k][0]:5.3f}  {row[k][1]:5.3f}' for k in values)
            print(f'{row["t"]:6.3f} {len(ring):3d}   {cells}   {row["low"]}/{row["high"]}')
    return rows


def image_pixels(img):
    """Gives the pixels of a Blender image as sRGB values (height × width × 3), in the row order
    of Blender."""
    width, height = img.size
    pixels = np.empty(width * height * 4, np.float32)
    img.pixels.foreach_get(pixels)
    return pixels.reshape(height, width, 4)[:, :, :3]


def base_texture(texture):
    """Reads a base color texture as sRGB pixels (`image_pixels()`): the texture of the first
    mesh of a GLB file (`glb_texture()`), an image file, such as the base color JPEG of an FBX
    source, or an image of Blender, such as the image of the material of the mesh."""
    if isinstance(texture, bpy.types.Image):
        return image_pixels(texture)
    if texture.lower().endswith('.glb'):
        return glb_texture(texture)
    img = bpy.data.images.load(texture, check_existing=False)
    pixels = image_pixels(img)
    bpy.data.images.remove(img)
    return pixels


def glb_texture(path):
    """Reads the base color texture of the first mesh of a GLB file as sRGB pixels (height ×
    width × 3), in the row order of Blender, as `load_mesh()` of `rig_mesh.py` reads it."""
    with open(path, 'rb') as f:
        data = f.read()
    size = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20 : 20 + size])
    binary = data[28 + size :]
    material = doc['materials'][doc['meshes'][0]['primitives'][0]['material']]
    texture = doc['textures'][material['pbrMetallicRoughness']['baseColorTexture']['index']]
    image = doc['images'][texture['source']]
    view = doc['bufferViews'][image['bufferView']]
    start = view.get('byteOffset', 0)
    with tempfile.TemporaryDirectory() as folder:
        file = os.path.join(folder, 'base.' + image['mimeType'].split('/')[1])
        with open(file, 'wb') as f:
            f.write(binary[start : start + view['byteLength']])
        img = bpy.data.images.load(file)
        pixels = image_pixels(img)
        bpy.data.images.remove(img)
    return pixels


def polygon_colors(me, texture, rules, rm):
    """Gives the sRGB color and the dark flag of each polygon by the rule of `face_colors()` of
    `rig_mesh.py`, over the texture samples of all triangles of the polygon."""
    grid = rm['sample_grid'](rules['samples'])
    uv = np.empty(len(me.loops) * 2)
    me.uv_layers.active.data.foreach_get('uv', uv)
    uv = uv.reshape(-1, 2)
    samples = [[] for _ in me.polygons]
    for t in me.loop_triangles:
        samples[t.polygon_index].append(rm['face_samples'](uv[list(t.loops)], grid, texture))
    colors, dark = np.zeros((len(me.polygons), 3)), np.zeros(len(me.polygons), bool)
    for p, parts in enumerate(samples):
        found = np.concatenate(parts)
        low = rm['luminance'](found) < rules['dark']
        dark[p] = low.mean() >= rules['eyeShare']
        kept = found[low] if dark[p] else found[~low]
        if not dark[p] and 'split' in rules:
            light = rm['oklab'](kept)[:, 0]
            if np.ptp(light) > rules['split']:
                upper = light >= (light.min() + light.max()) / 2
                kept = kept[upper] if upper.sum() * 2 >= len(kept) else kept[~upper]
        colors[p] = kept.mean(axis=0)
    return colors, dark


def surface_material(name):
    """Gives the material of a slot of a hand rig: its base color reads the face attribute
    `color`, so that Material Preview shows the face colors."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    if not any(n.type == 'ATTRIBUTE' for n in mat.node_tree.nodes):
        bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        node = mat.node_tree.nodes.new('ShaderNodeAttribute')
        node.attribute_name = 'color'
        mat.node_tree.links.new(node.outputs['Color'], bsdf.inputs['Base Color'])
    return mat


def add_surface(body, species, texture=None, eye_fans=True):
    """Gives the mesh of a hand rig its face colors, its eye fans, and its gloss nose (design 4.4,
    "Hand rig"), in place: each polygon takes the color of the base color texture of `texture`
    through the UVs of the mesh, by the color rules of `tools/mesh-rigs/<species>.json`. The
    texture is a GLB file (`assets/models/<species>/<species>-tpose.glb` by default) or an image
    file, as a path from the repository root, or an image of Blender (`base_texture()`). The fans
    and the vertices of the nose take the head bone alone, and the slots become `fur` and `gloss`.
    With `eye_fans` false, the mesh gets no fans: a rig with eye objects (`studio_eyes.py`) needs
    none. The faces of the old eyes take the fur color in both cases. Gives the counts of the
    faces."""
    config = load_config(species)
    rm = rig_mesh_lib()
    me = body.data
    if 'color' in me.attributes:
        raise SystemExit('The mesh has the face attribute color: add_surface() ran already.')
    if not isinstance(texture, bpy.types.Image):
        texture = os.path.join(ROOT, texture or f'assets/models/{species}/{species}-tpose.glb')
    me.calc_loop_triangles()
    tris = np.array([t.vertices[:] for t in me.loop_triangles])
    owner = np.array([t.polygon_index for t in me.loop_triangles])
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    verts = co.reshape(-1, 3) @ TO_STUDIO.T
    rgb, dark = polygon_colors(me, base_texture(texture), config['colors'], rm)
    eyes, nose = rm['features'](verts, tris, rgb[owner], dark[owner], config['colors'])
    points, _, tris_all, colors, kinds, old, near = rm['add_eye_shells'](
        verts, verts, tris, rgb[owner], dark[owner], eyes, config['eyeShell']
    )
    if not eye_fans:
        points, tris_all = points[: len(verts)], tris_all[: len(tris)]
        colors, kinds = colors[: len(tris)], kinds[: len(tris)]
    kinds[nose] = 'gloss'
    colors, _, _ = rm['palette'](colors, config['colors']['palette'])
    for patch in list(old.values()) + [p for side in near.values() for p in side]:
        colors, _ = rm['recolor_old_eyes'](colors, tris, verts, patch)

    polygons = len(me.polygons)
    bm = bmesh.new()
    bm.from_mesh(me)
    shapes = list(bm.verts.layers.shape.values())
    for point in points[len(verts) :] @ TO_STUDIO:
        v = bm.verts.new(point.tolist())
        for layer in shapes:
            v[layer] = v.co
    bm.verts.ensure_lookup_table()
    for fan in tris_all[len(tris) :]:
        bm.faces.new([bm.verts[int(i)] for i in fan])
    bm.to_mesh(me)
    bm.free()

    # Each polygon takes the color of its first triangle, and each fan triangle its own.
    first = {}
    for t, p in enumerate(owner):
        first.setdefault(int(p), t)
    rows = [first[p] for p in range(polygons)] + list(range(len(tris), len(tris_all)))
    gloss = np.zeros(len(me.polygons), bool)
    gloss[owner[kinds[: len(tris)] == 'gloss']] = True
    gloss[polygons:] = True
    rgba = np.concatenate([rm['linear'](colors[rows]), np.ones((len(rows), 1))], axis=1).ravel()
    for name in ('color', 'color_base'):
        me.attributes.new(name, 'FLOAT_COLOR', 'FACE').data.foreach_set('color', rgba)
    me.materials.clear()
    for name in ('fur', 'gloss'):
        me.materials.append(surface_material(name))
    me.polygons.foreach_set('material_index', gloss.astype(int).tolist())
    on_head = sorted({v for p in np.nonzero(gloss)[0] for v in me.polygons[p].vertices})
    for group in body.vertex_groups:
        group.remove(on_head)
    (body.vertex_groups.get('head') or body.vertex_groups.new(name='head')).add(
        on_head, 1.0, 'REPLACE'
    )
    me.update()
    return {
        'faces': len(me.polygons),
        'fans': len(tris_all) - len(tris),
        'gloss': int(gloss.sum()),
        'head': len(on_head),
    }


def import_source(path, weld):
    """Adds the mesh of a source GLB file in the units of the studio, as `load_mesh()` of
    `rig_mesh.py` reads it: welded, 1 unit from the soles to the top, the soles at z = 0. The
    UVs stay."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    found = [o for o in bpy.data.objects if o not in before]
    source = [o for o in found if o.type == 'MESH']
    if len(source) != 1:
        raise SystemExit(f'{path} must have 1 mesh. It has {len(source)}.')
    bm = bmesh.new()
    bm.from_mesh(source[0].data)
    bm.transform(source[0].matrix_world)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=weld)
    heights = [v.co.z for v in bm.verts]
    scale = 1.0 / (max(heights) - min(heights))
    bm.transform(
        Matrix.Diagonal((scale, scale, scale, 1)) @ Matrix.Translation((0, 0, -min(heights)))
    )
    me = bpy.data.meshes.new('body')
    bm.to_mesh(me)
    bm.free()
    for o in found:
        bpy.data.objects.remove(o)
    body = bpy.data.objects.new('body', me)
    bpy.context.scene.collection.objects.link(body)
    return body


def build_armature(config, rm):
    """Adds the armature of a config in the T-pose of the source, with the rolls of `frame()`, the
    custom properties `palm`, `seat`, and `hinges`, and the Action `bind` of the seat rules."""
    # The joints of the config hold no segment: the segments follow from the arm joints.
    bones = rm['BONES']
    rm['BONES'] = tuple(b for b in bones if b not in rm['SEGMENT_PARENTS'])
    heads, ends, rolls, children = rm['joints_of'](config)
    rm['BONES'] = bones
    if 'armSegments' in config:
        rm['segment_joints'](heads, ends, rolls, children, config['armSegments'])
    to_blender = rm['to_blender']
    rig = bpy.data.objects.new('rig', bpy.data.armatures.new('rig'))
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for name in rm['BONES']:
        eb = rig.data.edit_bones.new(name)
        eb.head, eb.tail = to_blender(heads[name]).tolist(), to_blender(ends[name]).tolist()
        eb.align_roll(Vector(to_blender(rolls[name]).tolist()))
    for name in rm['BONES']:
        if rm['PARENTS'][name]:
            rig.data.edit_bones[name].parent = rig.data.edit_bones[rm['PARENTS'][name]]
    bpy.ops.object.mode_set(mode='OBJECT')
    for bone in rig.data.bones:
        bone.bbone_segments = 1
        bone.use_deform = not ('armSegments' in config and bone.name in DRIVERS)
        rig.pose.bones[bone.name].rotation_mode = 'QUATERNION'
    rig['palm'] = to_blender(rm['unit'](config['palm'])).tolist()
    rig['seat'] = {
        'prop': config['chair'].get('prop', 'chair'),
        **{k: float(config['chair'][k]) for k in ('front', 'back', 'halfWidth')},
    }
    trunk = rm['trunk_turn'](config, heads, ends, rolls)
    turns = rm['bind_turns'](config, heads, ends, rolls, trunk)
    hinges = rm['bind_hinges'](config, turns, heads, ends)
    if hinges is not None:
        rig['hinges'] = {side: to_blender(axis).tolist() for side, axis in hinges.items()}
    action = bpy.data.actions.new('bind')
    action.use_fake_user = True
    rig.animation_data_create().action = action
    set_world_turns(rig, turns, pose_worlds(rig), key_frame=1)
    return rig


def skin_mesh(body, rig, auto):
    """Puts the mesh on the armature with one Armature modifier. With `auto`, the mesh takes the
    automatic weights of Blender in the rest pose, at most four bones for each vertex, and the
    gloss vertices keep the head bone alone. Gives the count of the vertices with no weight."""
    body.parent = rig
    if not auto:
        body.modifiers.new('armature', 'ARMATURE').object = rig
        return 0
    head = sorted({v for p in body.data.polygons if p.material_index == 1 for v in p.vertices})
    rig.data.pose_position = 'REST'
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
    for group in body.vertex_groups:
        group.remove(head)
    body.vertex_groups['head'].add(head, 1.0, 'REPLACE')
    rig.data.pose_position = 'POSE'
    return sum(1 for v in body.data.vertices if not any(g.weight > 0 for g in v.groups))


def main():
    """Runs the command of the arguments after `--`."""
    rest = sys.argv[sys.argv.index('--') + 1 :]
    if rest[:1] in (['--drive'], ['--rolls']) and len(rest) == 2:
        bpy.ops.wm.open_mainfile(filepath=rest[1])
        rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
        if rest[0] == '--rolls':
            fix_rolls(rig)
        else:
            action = bpy.data.actions['bind']
            rig.animation_data_create().action = action
            rig.pose.apply_pose_from_action(action, evaluation_time=action.frame_range[0])
            drive_segments(rig, key_frame=action.frame_range[0])
        bpy.ops.wm.save_mainfile()
        print(f'studio_armature: wrote {rest[1]}', flush=True)
        return
    if '--out' not in rest:
        raise SystemExit(
            'Usage: studio_armature.py -- <animal> --out <file.blend> '
            '[--source <glb>] [--auto-weights], or -- --drive|--rolls <file.blend>'
        )
    config = load_config(rest[0])
    out = rest[rest.index('--out') + 1]
    source = rest[rest.index('--source') + 1] if '--source' in rest else config['source']
    bpy.ops.wm.read_factory_settings(use_empty=True)
    body = import_source(os.path.join(ROOT, source), config['weld'])
    counts = add_surface(body, rest[0], source)
    rm = rig_mesh_lib()
    rm['BONES'] = config_bones(rm, config)
    rig = build_armature(config, rm)
    empty = skin_mesh(body, rig, '--auto-weights' in rest)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(out))
    print(
        f'studio_armature: wrote {out}: {counts}, {len(rig.data.bones)} bones, {empty} vertices '
        f'with no weight',
        flush=True,
    )


if __name__ == '__main__':
    main()
