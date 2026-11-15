"""Exports the hand rig of a body into the GLB format of a body (design 4.4).

    blender -b --factory-startup --python tools/blender/export_rig.py -- <animal> \
        [--blend <file.blend>] [--out <file.glb>]

`pnpm rig-export <animal>` runs it on `assets/models/<animal>/tripo-hand/<animal>.blend`, and writes
`<animal>.rig.glb` and `<animal>.rig.json` (a text summary for diffs) next to it. `pnpm body-module`
reads the GLB file. The script checks the layout of design 4.4 and stops at the first fault with its
name. Then it bakes the bind: the rest of the file is the basis with the keys `bind*`, moved by the
linear blend of the bones in the Action `bind`, and the move of each key `arm_raise_*` is its move
in the bind. The bake must match the mesh that Blender evaluates within `LIMIT`. The measures use
the functions of `rig_mesh.py`: the shapes of the source (`correctives()`, `split_shapes()`), the
seat top (`seat_masks()`), and the rule of the arm segments (`driven_turns()`). The eye objects
`eye_L` and `eye_R` (`body_eyes.py`) give the middle, the direction, and the size of each bead eye
in the bind (`eyes_of()`). A file with no eye objects shows the eyes of its mesh: the faces with the
face attribute `eye` give the middle of each eye in the bind (`own_eyes_of()`) and the triangles of
each eye, and the app adds no bead eyes. Such a file can have lids: the faces with the face
attribute `lid` and the custom property `lids` of the armature give the lid triangles, the turn from
open to closed, and the hinge axis of each side (`lids_of()`). The custom properties of the armature
give the facts of the body (`body_of()`). The bytes depend only on the `.blend`. A mesh object with
the custom property `texture` also gets the texture point of each corner (`texture_of()`).
"""

import hashlib
import json
import math
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import body_armature as sa  # noqa: E402
import body_eyes as se  # noqa: E402

#: The largest gap of the bake from the mesh that Blender evaluates, in units.
LIMIT = 1e-5

#: The largest gap of a weight sum from 1, of a rotation from a unit frame, and of a turn of an arm
#: segment from the rule of the app (radians).
WEIGHT_LIMIT, FRAME_LIMIT, TURN_LIMIT = 1e-4, 1e-5, 1e-4

#: The largest angle of the Z axis of a bone from its roll hint in the pose of the sheet (radians).
ROLL_LIMIT = math.radians(0.5)

#: The decimals of the values of the eyes in the extras. The module of the app rounds its points
#: to 1e-6 m, and an eye gives the head of its eye bone.
EYE_DECIMALS = 9

#: The facts of the body that the armature holds as custom properties, under the names of the
#: settings of `ANIMALS` of `tools/body-module.ts` (`BODY_FACTS`), with their units there. The
#: first two are required.
BODY_FACTS = (
    'height',
    'crease',
    'colorBlend',
    'seatBack',
    'backRoom',
    'seatWidth',
    'headFloor',
    'noseTop',
    'mouthHeight',
    'headCeiling',
    'cueHeadLeft',
    'cueHeadRight',
    'cueLift',
)

#: The trunk bones whose turn from the pose of the sheet to the bind gives `trunk` of the extras.
TRUNK_BONES = ('hips', 'spine', 'spine1', 'chest', 'neck', 'head')


def fail(text):
    """Prints a fault and stops with the exit code 1."""
    print(f'export_rig: error: {text}', file=sys.stderr, flush=True)
    sys.exit(1)


def need(ok, text):
    """Stops with the fault `text` when `ok` is false."""
    if not ok:
        fail(text)


def objects():
    """Gives the one armature, the one mesh of the body, and the eye object of each side, or no
    eye objects for a file that shows the eyes of its mesh."""
    rigs = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    names = set(se.EYE_OBJECTS.values())
    bodies = [o for o in bpy.data.objects if o.type == 'MESH' and o.name not in names]
    need(
        len(rigs) == 1 and len(bodies) == 1,
        f'The file must have 1 armature and 1 mesh. It has {len(rigs)} and {len(bodies)}.',
    )
    for o in rigs + bodies:
        need(np.abs(sa.m64(o.matrix_world) - np.eye(4)).max() < 1e-6, f'{o.name} has a transform.')
    eyes = {side: bpy.data.objects.get(name) for side, name in se.EYE_OBJECTS.items()}
    if all(eye is None for eye in eyes.values()):
        return rigs[0], bodies[0], {}
    for side, eye in eyes.items():
        name = se.EYE_OBJECTS[side]
        need(eye is not None and eye.type == 'MESH', f'The file has no mesh object {name}.')
        need(
            eye.parent == rigs[0] and eye.parent_type == 'BONE' and eye.parent_bone == se.EYE_BONE,
            f'The parent of {name} must be the bone {se.EYE_BONE} of the armature.',
        )
    return rigs[0], bodies[0], eyes


def check_rig(rig, body, rm, bones, order):
    """Checks the bones, the modifier, the materials, and the face attributes of the layout."""
    names = set(rig.data.bones.keys())
    extra = sorted(names - set(order))
    optional = (rm['TAIL_TIP'], rm['JAW']) + rm['segment_bones']() + rm['digit_bones']()
    missing = [b for b in order if b not in names and b not in optional]
    need(not extra and not missing, f'The bones add {extra} and lack {missing}.')
    segments = [b for b in rm['segment_bones']() if b in names]
    need(len(segments) in (0, 20), f'The rig has {len(segments)} of the 20 arm segments.')
    digits = [b for b in rm['digit_bones']() if b in names]
    need(len(digits) in (0, 10), f'The rig has {len(digits)} of the 10 digit bones.')
    for name in bones:
        bone, pb = rig.data.bones[name], rig.pose.bones[name]
        parent = bone.parent.name if bone.parent else None
        need(parent == rm['PARENTS'][name], f'The parent of {name} is {parent}.')
        need(pb.rotation_mode == 'QUATERNION', f'The bone {name} has no quaternion mode.')
        need(not pb.constraints and bone.bbone_segments == 1, f'{name}: a constraint or B-Bone.')
    mods = list(body.modifiers)
    need(
        len(mods) == 1 and mods[0].type == 'ARMATURE' and mods[0].object == rig,
        'The mesh needs one Armature modifier of the rig and no other modifier.',
    )
    need(
        mods[0].use_vertex_groups
        and not mods[0].use_bone_envelopes
        and not mods[0].use_deform_preserve_volume
        and not mods[0].use_multi_modifier,
        'The Armature modifier needs vertex groups, no envelopes, no preserve volume.',
    )
    slots = [m.name if m else '' for m in body.data.materials]
    need(
        set(slots) <= {'fur', 'gloss'},
        f'The material slots must be fur and gloss. They are {slots}.',
    )
    kinds = {
        'color': 'FLOAT_COLOR',
        'color_base': 'FLOAT_COLOR',
        'rim': 'BOOLEAN',
        'plain': 'BOOLEAN',
        'eye': 'BOOLEAN',
        'lid': 'BOOLEAN',
    }
    for name, kind in kinds.items():
        a = body.data.attributes.get(name)
        need(
            a is None and name != 'color' or a and a.domain == 'FACE' and a.data_type == kind,
            f'The face attribute {name} must be a {kind} of the domain FACE.',
        )
    need(bpy.data.actions.get('bind') is not None, 'The file has no Action bind.')


def face_values(me, name, size, default=None):
    """Gives the values of a face attribute, one row for each polygon."""
    a = me.attributes.get(name)
    if a is None:
        return default
    out = np.zeros(len(me.polygons) * size, np.float32 if size > 1 else bool)
    a.data.foreach_get('color' if size > 1 else 'value', out)
    return out.reshape(len(me.polygons), size).astype(float) if size > 1 else out


def read_weights(body, rig, bones, most):
    """Gives the weights of each vertex on each bone (vertices × bones), as stored."""
    index = {}
    for g in body.vertex_groups:
        need(
            g.name in bones and rig.data.bones[g.name].use_deform,
            f'The vertex group {g.name} is no deform bone of the body.',
        )
        index[g.index] = bones.index(g.name)
    w = np.zeros((len(body.data.vertices), len(bones)))
    for v in body.data.vertices:
        for g in v.groups:
            w[v.index, index[g.group]] += g.weight
        count, total = int((w[v.index] > 0).sum()), w[v.index].sum()
        need(1 <= count <= most, f'The vertex {v.index} has {count} bones.')
        need(
            abs(total - 1) <= WEIGHT_LIMIT,
            f'The weights of the vertex {v.index} add up to {total}.',
        )
    return w


def read_keys(body, rm):
    """Gives the basis, the moves of the keys `bind*`, of the corrective shapes in their order, and
    of the drawn shapes of the source, each in Blender axes, after the checks of design 4.4."""
    me = body.data
    blocks = list(me.shape_keys.key_blocks) if me.shape_keys else []
    coords = {}
    for k in blocks:
        co = np.empty(len(me.vertices) * 3, np.float32)
        k.data.foreach_get('co', co)
        coords[k.name] = co.reshape(-1, 3).astype(float)
    if not blocks:
        co = np.empty(len(me.vertices) * 3, np.float32)
        me.vertices.foreach_get('co', co)
        return co.reshape(-1, 3).astype(float), [], {}, {}
    basis, fixes, raises, drawn, seen = coords[blocks[0].name], [], {}, {}, {'L': 0, 'R': 0}
    for k in blocks[1:]:
        need(
            k.relative_key == blocks[0] and not k.vertex_group and not k.mute,
            f'The key {k.name} must be relative to the basis, with no mask, and not muted.',
        )
        move = coords[k.name] - basis
        if k.name.startswith('bind'):
            fixes.append(move)
        elif k.name in rm['SHAPES']:
            drawn[k.name] = move
        elif k.name.startswith('arm_raise_'):
            props = me.get(k.name)
            props = props.to_dict() if hasattr(props, 'to_dict') else {}
            side = props.get('side')
            need(side in ('L', 'R'), f'The property {k.name} of the mesh has no side L or R.')
            seen[side] += 1
            name = f'arm_raise_{side}' + (str(seen[side]) if seen[side] > 1 else '')
            need(k.name == name, f'The key {k.name} of the side {side} must be {name}.')
            turn, fade = list(props.get('turn', [])), list(props.get('fade', []))
            need(
                props.get('bone') in (None, 'forearm', 'hand'),
                f'{name}: the bone must be forearm, hand, or none.',
            )
            need(
                len(turn) == 4 and abs(math.hypot(*turn) - 1) < 1e-4,
                f'{name}: the turn must be a unit quaternion.',
            )
            need(
                len(fade) == 2 and 0 <= fade[0] < fade[1],
                f'{name}: the fade must be two angles with 0 <= full < none.',
            )
            raises[name] = (props, move)
        else:
            fail(f'The key {k.name} is not bind*, arm_raise_*, or a shape of the source.')
    need(len(raises) <= rm['RAISE_LIMIT'], f'The mesh has {len(raises)} raise keys.')
    need(
        len(drawn) in (0, 4),
        f'The mesh draws {sorted(drawn)}. It must draw all four shapes or none.',
    )
    return basis, fixes, raises, drawn


def skin_matrices(rest, worlds, bones, rig):
    """Gives the matrix of each bone from the rest to a pose (bones × 4 × 4), in Blender axes."""
    return np.array(
        [worlds[b] @ np.linalg.inv(sa.m64(rig.data.bones[b].matrix_local)) for b in bones]
    )


def skin_points(w, matrices, points):
    """Moves points by the linear blend of the bones, with the weights `w`."""
    moved = np.einsum('bij,nj->nbi', matrices[:, :3, :3], points) + matrices[:, :3, 3]
    return np.einsum('nb,nbi->ni', w, moved)


def evaluated(body, values):
    """Gives the vertices of the mesh that Blender evaluates with the key values, in the bind."""
    for k in body.data.shape_keys.key_blocks[1:] if body.data.shape_keys else []:
        k.value = values.get(k.name, 0.0)
    bpy.context.view_layer.update()
    ev = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    ev.to_mesh_clear()
    return co.reshape(-1, 3)


def frames_of(worlds, bones):
    """Gives the frame and the head of each bone in the axes of the body, after a check that the
    frame turns with no scale."""
    out = {}
    for b in bones:
        f = sa.TO_BODY @ worlds[b][:3, :3]
        need(np.abs(f.T @ f - np.eye(3)).max() < FRAME_LIMIT, f'The bone {b} scales or shears.')
        out[b] = (f, sa.TO_BODY @ worlds[b][:3, 3])
    return out


def eyes_of(rig, eyes, bind):
    """Gives the middle, the unit direction, and the size of each eye object in the bind, in the
    units and the axes of the body, after a check that the object has an even scale and that its
    Y axis points up along the plane of the eye (`body_eyes.fit_eyes()`)."""
    out = {}
    for side, eye in eyes.items():
        world = se.eye_world(rig, eye, bind)
        scales = np.linalg.norm(world[:3, :3], axis=0)
        size = float(scales.mean())
        frame = world[:3, :3] / scales
        need(np.ptp(scales) <= 1e-5 * size, f'{eye.name} has no even scale: {scales}.')
        need(
            np.abs(frame.T @ frame - np.eye(3)).max() < FRAME_LIMIT and np.linalg.det(frame) > 0,
            f'{eye.name} shears or mirrors.',
        )
        level = se.eye_frame(frame[:, 2])[:, 1]
        roll = math.atan2(np.linalg.norm(np.cross(frame[:, 1], level)), frame[:, 1] @ level)
        need(
            roll <= ROLL_LIMIT,
            f'The Y axis of {eye.name} is {math.degrees(roll):.2f} degrees off up. Run '
            'body_eyes.fit_eyes().',
        )
        middle = sa.TO_BODY @ world[:3, 3]
        need(middle[0] * (1 if side == 'L' else -1) > 0, f'{eye.name} is on the wrong side.')
        out[side] = {
            'middle': [round(float(x), EYE_DECIMALS) + 0.0 for x in middle],
            'direction': [round(float(x), EYE_DECIMALS) + 0.0 for x in sa.TO_BODY @ frame[:, 2]],
            'size': round(size, EYE_DECIMALS),
        }
    return out


def ball_middle(points):
    """Gives the middle of the sphere that fits the points best (least squares)."""
    a = np.c_[2 * points, np.ones(len(points))]
    return np.linalg.lstsq(a, (points**2).sum(axis=1), rcond=None)[0][:3]


def own_eyes_of(me, points, head):
    """Gives the middle of each eye of the mesh in the bind, in the units and the axes of the
    body: the middle of the sphere that fits the vertices of the eyeball faces on each side. An
    eyeball face has the face attribute `eye` and no `plain`. An eye face with `plain` keeps
    its face color and no texture, and the fit skips it. The eye bone of the app lies at
    the middle, and a lid turns about it. Each vertex of an eye must follow only the head bone
    (`head` holds the head weight of each vertex), so that the eye keeps its form in a blink."""
    flags = face_values(me, 'eye', 1, np.zeros(len(me.polygons), bool))
    plain = face_values(me, 'plain', 1, np.zeros(len(me.polygons), bool))
    head_rows = {v for p in me.polygons if flags[p.index] for v in p.vertices}
    corners = {v for p in me.polygons if flags[p.index] and not plain[p.index] for v in p.vertices}
    out = {}
    for side, sign in (('L', 1), ('R', -1)):
        mine = sorted(v for v in corners if points[v][0] * sign > 0)
        need(mine, f'The file has no eye objects and no eye faces on the side {side}.')
        every = sorted(v for v in head_rows if points[v][0] * sign > 0)
        need(
            np.abs(head[every] - 1).max() <= WEIGHT_LIMIT,
            f'A vertex of the eye {side} of the mesh does not follow only the head bone.',
        )
        middle = ball_middle(points[mine])
        out[side] = {'middle': [round(float(x), EYE_DECIMALS) + 0.0 for x in middle]}
    return out


def lids_of(rig, me, points, head, eyes, turn):
    """Gives the lids of the eyes of the mesh in the bind, in the axes of the body: the turn from
    open to closed (radians) and the unit hinge axis of each side. The custom property `lids` of
    the armature holds the angle and the axis of each side in the rest of the file: {'angle', 'L',
    'R'}. `turn` is the turn of the head bone from the rest to the bind. Each vertex of a face with
    the face attribute `lid` must follow only the head bone, and lie farther from the middle of
    its eye (`eyes`, of `own_eyes_of()`) than each vertex of the ball, so that a turn about the
    middle never moves the lid into the ball. A file with no property has no lids: None."""
    lids = sa.rig_property(rig, 'lids')
    flags = face_values(me, 'lid', 1, np.zeros(len(me.polygons), bool))
    if lids is None:
        need(not flags.any(), 'The mesh has lid faces, and the armature has no property lids.')
        return None
    angle = lids.get('angle')
    need(
        isinstance(angle, (int, float)) and 0 < angle < 2 * math.pi,
        'The angle of the property lids is not from 0 to 2 pi.',
    )
    balls = face_values(me, 'eye', 1, np.zeros(len(me.polygons), bool))
    ball = {v for p in me.polygons if balls[p.index] for v in p.vertices}
    lid = {v for p in me.polygons if flags[p.index] for v in p.vertices}
    need(lid and not lid & ball, 'The property lids needs lid faces apart from the eye faces.')
    need(
        np.abs(head[sorted(lid)] - 1).max() <= WEIGHT_LIMIT,
        'A vertex of a lid does not follow only the head bone.',
    )
    out = {'angle': round(float(angle), 6), 'axes': {}}
    for side, sign in (('L', 1), ('R', -1)):
        mine = sorted(v for v in lid if points[v][0] * sign > 0)
        need(mine, f'The file has no lid on the side {side}.')
        middle = np.array(eyes[side]['middle'])
        near = np.linalg.norm(points[mine] - middle, axis=1).min()
        far = np.linalg.norm(
            points[sorted(v for v in ball if points[v][0] * sign > 0)] - middle, axis=1
        )
        need(near > far.max(), f'The lid {side} comes nearer to the middle than its eyeball.')
        axis = sa.TO_BODY @ (turn @ np.array(lids[side], float))
        need(abs(np.linalg.norm(axis) - 1) < 1e-3, f'The lid axis {side} is not a unit vector.')
        out['axes'][side] = [round(float(x), 6) + 0.0 for x in axis / np.linalg.norm(axis)]
    return out


def body_of(rig):
    """Gives the facts of the body of the custom properties of the armature (`BODY_FACTS`), after
    a check that each is a finite number and that the required facts exist."""
    out = {}
    for name in BODY_FACTS:
        value = sa.rig_property(rig, name)
        if value is None:
            need(name not in BODY_FACTS[:2], f'The armature needs the property {name}.')
            continue
        need(
            isinstance(value, (int, float))
            and not isinstance(value, bool)
            and math.isfinite(value),
            f'The property {name} of the armature is not a number.',
        )
        out[name] = value
    return out


def extras_of(rig, me, rm, bones, points, w, turns, raises):
    """Gives the extras of the asset: the seat, the corrective shapes, the elbow axes, the rim, and
    the recline."""
    seat = sa.rig_property(rig, 'seat') or {}
    need(
        seat.get('prop') in ('chair', 'bench')
        and all(isinstance(seat.get(k), (int, float)) for k in ('front', 'back', 'halfWidth')),
        'The armature needs the property seat with prop, front, back, and halfWidth.',
    )
    over, hanging, tail, _ = rm['seat_masks'](points, w, seat)
    need(not (over & hanging).any(), 'A shin or a foot lies over the seat.')
    extras = {
        'seat': rm['seat_extras'](seat, seat['prop'], points[over & ~hanging & ~tail, 1].min())
    }
    if raises:
        extras['raise'] = []
        for name, (props, _) in raises.items():
            q = props['turn']
            turn = [*(sa.TO_BODY @ np.array(q[1:], float)), q[0]]
            entry = {
                'side': props['side'],
                'turn': [round(float(x), 6) + 0.0 for x in turn],
                'fade': [float(x) for x in props['fade']],
            }
            if props.get('bone'):
                entry['bone'] = props['bone']
            extras['raise'].append({**entry, 'target': name})
    hinges = sa.rig_property(rig, 'hinges')
    if hinges is not None:
        extras['hinges'] = {
            s: [round(float(x), 6) + 0.0 for x in sa.TO_BODY @ np.array(hinges[s], float)]
            for s in 'LR'
        }
    shift = sa.rig_property(rig, 'headShift')
    if shift is not None:
        # `pnpm body-module` adds the shift to the head center of the holds
        # (`Body.headCenter`). A rig sets it when a change of the surface moves the head box
        # but not the head, for example a nose that goes from the slot gloss to the slot fur.
        need(
            isinstance(shift, list)
            and len(shift) == 3
            and all(isinstance(x, (int, float)) and math.isfinite(x) for x in shift),
            'The property headShift of the armature is not three numbers in the body axes.',
        )
        extras['headShift'] = [float(x) + 0.0 for x in shift]
    factor = sa.rig_property(rig, 'headFactor')
    if factor is not None:
        # A hand rig that scales the head about the neck joint by the head weights. `pnpm
        # body-module` measures H and the head center before the factor.
        need(
            isinstance(factor, (int, float)) and math.isfinite(factor) and factor > 0,
            'The property headFactor of the armature is not a positive number.',
        )
        extras['headFactor'] = float(factor)
    angle, sign = 0.0, 1.0
    for b in TRUNK_BONES:
        x, y, z, q = rm['matrix_quat'](turns[b])
        turn = math.degrees(2 * math.atan2(math.hypot(x, y, z), q))
        if turn > angle:
            angle, sign = turn, -1.0 if x > 0 else 1.0
    if angle > 1e-3:
        extras['trunk'] = round(sign * angle, 6)
    return extras


def triangles(me):
    """Gives the corners, the material, the color, the base color, the rim flag, the lid flag, and
    the eye flag of each triangle, as Blender divides the faces, in the order of the faces."""
    me.calc_loop_triangles()
    owner = np.array([t.polygon_index for t in me.loop_triangles])
    slots = [m.name for m in me.materials]
    kinds = np.array([slots[p.material_index] for p in me.polygons])[owner]
    color = face_values(me, 'color', 4)[:, :3]
    base = face_values(me, 'color_base', 4, face_values(me, 'color', 4))[:, :3]
    names = ('rim', 'lid', 'eye')
    flags = [face_values(me, n, 1, np.zeros(len(me.polygons), bool))[owner] for n in names]
    need(not (np.any(flags, axis=0) & (kinds != 'fur')).any(), 'A flag face is not fur.')
    corners = np.array([t.vertices[:] for t in me.loop_triangles])
    return corners, kinds, color[owner], base[owner], *flags


def texture_of(body, me, kinds):
    """Gives the color map of the body and the texture point of each corner of each triangle, in
    the axes of glTF (v down), in the order of `triangles()`. The custom property `texture` of
    the mesh object names the web copy of the color map, relative to the repository. Each fur
    triangle takes the points of the active UV map. A gloss triangle and a fur face with the face
    attribute `plain`, such as a whisker, take (-1, -1) and keep their face colors. A body with no
    property has no texture: (None, None)."""
    path = body.get('texture')
    if path is None:
        return None, None
    need(
        isinstance(path, str) and os.path.isfile(os.path.join(sa.ROOT, path)),
        f'The texture {path} of the mesh is no file of the repository.',
    )
    need(me.uv_layers.active is not None, 'The mesh with a texture has no UV map.')
    me.calc_loop_triangles()
    owner = np.array([t.polygon_index for t in me.loop_triangles])
    loops = np.array([t.loops[:] for t in me.loop_triangles])
    points = np.zeros(len(me.loops) * 2, np.float32)
    me.uv_layers.active.data.foreach_get('uv', points)
    points = points.reshape(-1, 2).astype(float)
    uvs = points[loops]
    uvs[..., 1] = 1.0 - uvs[..., 1]
    plain = face_values(me, 'plain', 1, np.zeros(len(me.polygons), bool))[owner]
    uvs[(kinds != 'fur') | plain] = -1.0
    return path, uvs


def srgb(linear):
    """Gives the sRGB values of linear colors, the inverse of `linear()` of `rig_mesh.py`."""
    c = np.clip(linear, 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def bind_supination(rm, turns, heads):
    """Gives the bind supination of each paw in degrees, by the definition of `paw_supination()` of
    `rig_mesh.py`: the twist of the bind paw from the bind forearm about the forearm, from the
    elbow to the wrist, toward supination. `turns` and `heads` are the world turns from the pose of
    the sheet to the bind and the heads of the sheet, in the axes of the body."""
    out = {}
    for side, sign in (('L', -1.0), ('R', 1.0)):
        fore, hand = turns[f'forearm_{side}'], turns[f'hand_{side}']
        along = rm['unit'](fore @ (heads[f'hand_{side}'] - heads[f'forearm_{side}']))
        out[side] = round(math.degrees(sign * rm['twist_of'](hand @ fore.T, along)), 3) + 0.0
    return out


def summary(glb, bones, joints, w, shapes, extras, supination):
    """Gives the text summary of the rig for diffs: the bind head and a hash of the weights of each
    bone, the largest move of each shape, the extras, and the bind supination of each paw
    (`bind_supination()`), which `pnpm bind-supination` reads as the value of now."""
    return {
        'sha256': hashlib.sha256(glb).hexdigest(),
        'bindSupination': supination,
        'bones': {
            b: {
                'head': [round(float(x), 6) + 0.0 for x in joints[b][1]],
                'vertices': int((w[:, k] > 0).sum()),
                'weights': hashlib.sha256(w[:, k].astype(np.float32).tobytes()).hexdigest()[:16],
            }
            for k, b in enumerate(bones)
        },
        'shapes': {n: round(float(np.abs(s).max()), 6) for n, s in shapes.items()},
        'extras': extras,
    }


def main():
    """Checks, bakes, and writes the hand rig of the animal of the arguments."""
    rest = sys.argv[sys.argv.index('--') + 1 :]
    species = rest[0] if rest else fail('Usage: export_rig.py -- <animal> [--blend] [--out]')
    folder = os.path.join(sa.ROOT, 'assets', 'models', species, 'tripo-hand')
    blend = rest[rest.index('--blend') + 1] if '--blend' in rest else f'{folder}/{species}.blend'
    out = rest[rest.index('--out') + 1] if '--out' in rest else f'{folder}/{species}.rig.glb'
    need(os.path.isfile(blend), f'The file {blend} does not exist.')
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(blend))
    rig, body, eyes = objects()
    rm = sa.rig_mesh_lib()
    order = sa.body_order(rm)
    bones = [b for b in order if b in rig.data.bones]
    rm['BONES'] = tuple(bones)
    check_rig(rig, body, rm, bones, order)

    # The poses: the sheet (the Action `reference`, or the rest), and the bind.
    action = bpy.data.actions['bind']
    sheet, bind = sa.sheet_worlds(rig), sa.action_worlds(rig, action)
    for b in bones:
        z, y = sa.TO_BODY @ sheet[b][:3, 2], sa.TO_BODY @ sheet[b][:3, 1]
        aim = sa.TO_BODY @ sa.hint(rig, b)
        aim = (aim - (aim @ y) * y) / np.linalg.norm(aim - (aim @ y) * y)
        roll = math.atan2(np.linalg.norm(np.cross(z, aim)), z @ aim)
        need(
            roll <= ROLL_LIMIT, f'The roll of {b} is {math.degrees(roll):.2f} degrees off its hint.'
        )
    driven = sa.driven_segments(rig, rm, bind, sheet)
    turns, sheet_heads = sa.body_turns(bind, sheet)
    for b, t in driven.items():
        x, y, z, q = rm['matrix_quat'](t.T @ turns[b])
        gap = 2 * math.atan2(math.hypot(x, y, z), q)
        need(gap <= TURN_LIMIT, f'{b} is {gap:.5f} rad off the rule of the app: drive_segments().')

    # The bake in the bind, and its check against the mesh of Blender.
    w = read_weights(body, rig, bones, rm['INFLUENCES'])
    wn = w / w.sum(axis=1, keepdims=True)
    basis, fixes, raises, drawn = read_keys(body, rm)
    to_bind = skin_matrices(basis, bind, bones, rig)
    placed = skin_points(wn, to_bind, basis + sum(fixes, np.zeros_like(basis)))
    linear = np.einsum('nb,bij->nij', wn, to_bind[:, :3, :3])
    moves = {n: np.einsum('nij,nj->ni', linear, m) for n, m in drawn.items()}
    moves.update({n: np.einsum('nij,nj->ni', linear, m) for n, (_, m) in raises.items()})
    for pb in rig.pose.bones:
        pb.location, pb.rotation_quaternion, pb.scale = (0, 0, 0), (1, 0, 0, 0), (1, 1, 1)
    rig.data.pose_position = 'POSE'
    rig.animation_data_create().action = action
    if rig.animation_data.action_slot is None:
        rig.animation_data.action_slot = action.slots[0]
    bpy.context.scene.frame_set(int(action.frame_range[0]))
    on = (
        {k.name: 1.0 for k in body.data.shape_keys.key_blocks if k.name.startswith('bind')}
        if body.data.shape_keys
        else {}
    )
    seen = evaluated(body, on)
    need(np.abs(seen - placed).max() <= LIMIT, f'The bake is {np.abs(seen - placed).max()} u off.')
    for n, m in moves.items():
        gap = np.abs(evaluated(body, {**on, n: 1.0}) - seen - m).max()
        need(gap <= LIMIT, f'The move of the key {n} is {gap} u off the move in Blender.')

    # The shapes of the source: drawn, or the moves that give the source back in the sheet.
    points = placed @ sa.TO_BODY.T
    frames, sheet_frames = frames_of(bind, bones), frames_of(sheet, bones)
    heads = {b: frames[b][1] for b in bones}
    if drawn:
        source = {n: moves[n] @ sa.TO_BODY.T for n in rm['SHAPES']}
    else:
        src = skin_points(wn, skin_matrices(basis, sheet, bones, rig), basis) @ sa.TO_BODY.T
        back = rm['clip_turns'](turns, heads)
        found, _, _ = rm['correctives'](
            src, points, wn, back, {b: sheet_frames[b][1] for b in bones}, heads
        )
        source = rm['split_shapes'](found, wn, points)
    shapes = {**source, **{n: moves[n] @ sa.TO_BODY.T for n in raises}}
    extras = extras_of(rig, body.data, rm, bones, points, wn, turns, raises)
    if eyes:
        need(
            not face_values(body.data, 'eye', 1, np.zeros(1, bool)).any(),
            'The file has eye objects and eye faces. Keep one of them.',
        )
        extras['eyes'] = eyes_of(rig, eyes, bind)
    else:
        head = wn[:, bones.index('head')]
        extras['ownEyes'] = own_eyes_of(body.data, points, head)
        turn = to_bind[bones.index('head')][:3, :3]
        lids = lids_of(rig, body.data, points, head, extras['ownEyes'], turn)
        if lids:
            extras['lids'] = lids
    extras['body'] = body_of(rig)
    corners, kinds, colors, bases, rim, lid, eye = triangles(body.data)
    texture, uvs = texture_of(body, body.data, kinds)
    if texture:
        extras['texture'] = texture
    fur = np.cumsum(kinds == 'fur') - 1
    if rim.any():
        extras['rim'] = sorted(int(fur[t]) for t in np.nonzero(rim)[0])
    left = points[corners].mean(axis=1)[:, 0] > 0
    if 'ownEyes' in extras:
        for s in 'LR':
            mine = eye & (left == (s == 'L'))
            extras['ownEyes'][s]['faces'] = sorted(int(fur[t]) for t in np.nonzero(mine)[0])
    if 'lids' in extras:
        extras['lids']['faces'] = {
            s: sorted(int(fur[t]) for t in np.nonzero(lid & (left == (s == 'L')))[0]) for s in 'LR'
        }
    rm['write_glb'](
        out, {'name': body.name}, points, corners, srgb(colors), kinds, w, shapes,
        {b: f for b, (f, _) in frames.items()}, heads,
        {b: f for b, (f, _) in sheet_frames.items()}, {b: h for b, (_, h) in sheet_frames.items()},
        extras, None if (bases == colors).all() else srgb(bases),
        generator='pawchestra tools/blender/export_rig.py', uvs=uvs)  # fmt: skip
    with open(out, 'rb') as f:
        glb = f.read()
    with open(os.path.splitext(out)[0] + '.json', 'w') as f:
        json.dump(
            summary(glb, bones, frames, w, shapes, extras, bind_supination(rm, turns, sheet_heads)),
            f,
            indent=1,
        )
        f.write('\n')
    print(
        f'export_rig: wrote {out}: {len(glb)} bytes, {len(corners)} triangles, {len(bones)} '
        f'bones, shapes {list(shapes)}',
        flush=True,
    )


if __name__ == '__main__':
    main()
