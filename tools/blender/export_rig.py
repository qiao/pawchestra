"""Exports the hand rig of a studio body into the GLB format of a studio body (design 4.4).

    blender -b --factory-startup --python tools/blender/export_rig.py -- <animal> \
        [--blend <file.blend>] [--out <file.glb>]

`pnpm rig-export <animal>` runs it on `assets/models/<animal>/<animal>.blend`, and writes
`<animal>.rig.glb` and `<animal>.rig.json` (a text summary for diffs) next to it. `pnpm studio-body`
reads the GLB file as it reads a file of `rig_mesh.py`. The script checks the layout of design 4.4
and stops at the first fault with its name. Then it bakes the bind: the rest of the file is the
basis with the keys `bind*`, moved by the linear blend of the bones in the Action `bind`, and the
move of each key `arm_raise_*` is its move in the bind. The bake must match the mesh that Blender
evaluates within `LIMIT`. The measures use the functions of `rig_mesh.py`: the shapes of the source
(`correctives()`, `split_shapes()`), the seat top (`seat_masks()`), and the rule of the arm
segments (`driven_turns()`). The eye objects `eye_L` and `eye_R` (`studio_eyes.py`) give the
middle, the direction, and the size of each pea eye in the bind (`eyes_of()`), and the custom
properties of the armature give the facts of the body (`body_of()`). The bytes depend only on the
`.blend`.
"""

import hashlib
import json
import math
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import studio_armature as sa  # noqa: E402
import studio_eyes as se  # noqa: E402

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
#: settings of `ANIMALS` of `tools/studio-body.ts` (`BODY_FACTS`), with their units there. The
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
    'headCeiling',
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
    """Gives the one armature, the one mesh of the body, and the eye object of each side."""
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
    optional = (rm['TAIL_TIP'], rm['JAW']) + rm['segment_bones']()
    missing = [b for b in order if b not in names and b not in optional]
    need(not extra and not missing, f'The bones add {extra} and lack {missing}.')
    segments = [b for b in rm['segment_bones']() if b in names]
    need(len(segments) in (0, 20), f'The rig has {len(segments)} of the 20 arm segments.')
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
        'cap': 'BOOLEAN',
        'rim': 'BOOLEAN',
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
            f'The vertex group {g.name} is no deform bone of the studio.',
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
    """Gives the frame and the head of each bone in the axes of the studio, after a check that the
    frame turns with no scale."""
    out = {}
    for b in bones:
        f = sa.TO_STUDIO @ worlds[b][:3, :3]
        need(np.abs(f.T @ f - np.eye(3)).max() < FRAME_LIMIT, f'The bone {b} scales or shears.')
        out[b] = (f, sa.TO_STUDIO @ worlds[b][:3, 3])
    return out


def eyes_of(rig, eyes, bind):
    """Gives the middle, the unit direction, and the size of each eye object in the bind, in the
    units and the axes of the studio, after a check that the object has an even scale and that its
    Y axis points up along the plane of the eye (`studio_eyes.fit_eyes()`)."""
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
            'studio_eyes.fit_eyes().',
        )
        middle = sa.TO_STUDIO @ world[:3, 3]
        need(middle[0] * (1 if side == 'L' else -1) > 0, f'{eye.name} is on the wrong side.')
        out[side] = {
            'middle': [round(float(x), EYE_DECIMALS) + 0.0 for x in middle],
            'direction': [round(float(x), EYE_DECIMALS) + 0.0 for x in sa.TO_STUDIO @ frame[:, 2]],
            'size': round(size, EYE_DECIMALS),
        }
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
    """Gives the extras of the asset: the seat, the corrective shapes, the elbow axes, the caps,
    the rim, and the recline."""
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
            turn = [*(sa.TO_STUDIO @ np.array(q[1:], float)), q[0]]
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
            s: [round(float(x), 6) + 0.0 for x in sa.TO_STUDIO @ np.array(hinges[s], float)]
            for s in 'LR'
        }
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
    """Gives the corners, the material, the color, the base color, the cap flag, and the rim
    flag of each triangle, as Blender divides the faces, in the order of the faces."""
    me.calc_loop_triangles()
    owner = np.array([t.polygon_index for t in me.loop_triangles])
    slots = [m.name for m in me.materials]
    kinds = np.array([slots[p.material_index] for p in me.polygons])[owner]
    color = face_values(me, 'color', 4)[:, :3]
    base = face_values(me, 'color_base', 4, face_values(me, 'color', 4))[:, :3]
    flags = [face_values(me, n, 1, np.zeros(len(me.polygons), bool))[owner] for n in ('cap', 'rim')]
    need(not ((flags[0] | flags[1]) & (kinds != 'fur')).any(), 'A cap or rim face is not fur.')
    corners = np.array([t.vertices[:] for t in me.loop_triangles])
    return corners, kinds, color[owner], base[owner], flags[0], flags[1]


def srgb(linear):
    """Gives the sRGB values of linear colors, the inverse of `linear()` of `rig_mesh.py`."""
    c = np.clip(linear, 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def bind_supination(rm, turns, heads):
    """Gives the bind supination of each paw in degrees, by the definition of `paw_supination()` of
    `rig_mesh.py`: the twist of the bind paw from the bind forearm about the forearm, from the
    elbow to the wrist, toward supination. `turns` and `heads` are the world turns from the pose of
    the sheet to the bind and the heads of the sheet, in the axes of the studio."""
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
    folder = os.path.join(sa.ROOT, 'assets', 'models', species)
    blend = rest[rest.index('--blend') + 1] if '--blend' in rest else f'{folder}/{species}.blend'
    out = rest[rest.index('--out') + 1] if '--out' in rest else f'{folder}/{species}.rig.glb'
    need(os.path.isfile(blend), f'The file {blend} does not exist.')
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(blend))
    rig, body, eyes = objects()
    rm = sa.rig_mesh_lib()
    order = sa.studio_order(rm)
    bones = [b for b in order if b in rig.data.bones]
    rm['BONES'] = tuple(bones)
    check_rig(rig, body, rm, bones, order)

    # The poses: the sheet (the Action `reference`, or the rest), and the bind.
    action = bpy.data.actions['bind']
    sheet, bind = sa.sheet_worlds(rig), sa.action_worlds(rig, action)
    for b in bones:
        z, y = sa.TO_STUDIO @ sheet[b][:3, 2], sa.TO_STUDIO @ sheet[b][:3, 1]
        aim = sa.TO_STUDIO @ sa.hint(rig, b)
        aim = (aim - (aim @ y) * y) / np.linalg.norm(aim - (aim @ y) * y)
        roll = math.atan2(np.linalg.norm(np.cross(z, aim)), z @ aim)
        need(
            roll <= ROLL_LIMIT, f'The roll of {b} is {math.degrees(roll):.2f} degrees off its hint.'
        )
    driven = sa.driven_segments(rig, rm, bind, sheet)
    turns, sheet_heads = sa.studio_turns(bind, sheet)
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
    points = placed @ sa.TO_STUDIO.T
    frames, sheet_frames = frames_of(bind, bones), frames_of(sheet, bones)
    heads = {b: frames[b][1] for b in bones}
    if drawn:
        source = {n: moves[n] @ sa.TO_STUDIO.T for n in rm['SHAPES']}
    else:
        src = skin_points(wn, skin_matrices(basis, sheet, bones, rig), basis) @ sa.TO_STUDIO.T
        back = rm['clip_turns'](turns, heads)
        found, _, _ = rm['correctives'](
            src, points, wn, back, {b: sheet_frames[b][1] for b in bones}, heads
        )
        source = rm['split_shapes'](found, wn, points)
    shapes = {**source, **{n: moves[n] @ sa.TO_STUDIO.T for n in raises}}
    extras = extras_of(rig, body.data, rm, bones, points, wn, turns, raises)
    extras['eyes'] = eyes_of(rig, eyes, bind)
    extras['body'] = body_of(rig)
    corners, kinds, colors, bases, caps, rim = triangles(body.data)
    fur = np.cumsum(kinds == 'fur') - 1
    if caps.any():
        extras['caps'] = sorted(int(fur[t]) for t in np.nonzero(caps)[0])
    if rim.any():
        extras['rim'] = sorted(int(fur[t]) for t in np.nonzero(rim)[0])
    rm['write_glb'](
        out, {'name': body.name}, points, corners, srgb(colors), kinds, w, shapes,
        {b: f for b, (f, _) in frames.items()}, heads,
        {b: f for b, (f, _) in sheet_frames.items()}, {b: h for b, (_, h) in sheet_frames.items()},
        extras, None if (bases == colors).all() else srgb(bases),
        generator='pawchestra tools/blender/export_rig.py')  # fmt: skip
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
