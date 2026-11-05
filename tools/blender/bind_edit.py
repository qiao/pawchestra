"""Reads and edits the seated bind of a hand rig (design 4.4, "Hand rig") in headless Blender.

The bind is the mesh of the export: the basis with the keys `bind*` on, moved by the linear blend
of the bones in the Action `bind`. `tools/blender/rig_trial.py` and `tools/blender/bind_view.py`
use these functions, and a step of `pnpm rig-trial` can use them too:

    import bind_edit as be

    def run(body, rig, args):
        p = be.bind_points(body)
        move = np.zeros_like(p)
        move[1901] = (0.0, 0.0, -0.012)
        be.add_bind_move(body, rig, move, 'bind_lap')

All points are in the Blender axes of the file: the animal faces -Y, and its left side is at +X.
"""

import math
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import studio_eyes as se  # noqa: E402


def objects():
    """Gives the mesh of the body and the armature of the open file.

    Raises:
        ValueError: if the file has not one armature and one mesh of the body.
    """
    rigs = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    eyes = set(se.EYE_OBJECTS.values())
    bodies = [o for o in bpy.data.objects if o.type == 'MESH' and o.name not in eyes]
    if len(rigs) != 1 or len(bodies) != 1:
        raise ValueError(f'The file has {len(rigs)} armatures and {len(bodies)} body meshes.')
    return bodies[0], rigs[0]


def pose_bind(body, rig):
    """Puts the rig and the mesh into the bind of the export: the Action `bind` at its first frame,
    the keys `bind*` at 1, and the other keys at 0.

    Returns:
        A function that puts back the action, the slot, the frame, the bone transforms, and the
        key values of before, so that a saved file keeps them.
    """
    scene = bpy.context.scene
    data = rig.animation_data
    action = data.action if data else None
    slot = data.action_slot if data else None
    frame = scene.frame_current
    bones = {
        pb.name: (tuple(pb.location), tuple(pb.rotation_quaternion), tuple(pb.scale))
        for pb in rig.pose.bones
    }
    keys = body.data.shape_keys
    values = {k.name: k.value for k in keys.key_blocks} if keys else {}

    bind = bpy.data.actions['bind']
    for pb in rig.pose.bones:
        pb.location, pb.rotation_quaternion, pb.scale = (0, 0, 0), (1, 0, 0, 0), (1, 1, 1)
    rig.animation_data_create().action = bind
    if rig.animation_data.action_slot is None:
        rig.animation_data.action_slot = bind.slots[0]
    scene.frame_set(int(bind.frame_range[0]))
    for k in keys.key_blocks[1:] if keys else []:
        k.value = 1.0 if k.name.startswith('bind') else 0.0
    bpy.context.view_layer.update()

    def restore():
        for name, value in values.items():
            key = body.data.shape_keys.key_blocks.get(name)
            if key is not None:
                key.value = value
        rig.animation_data.action = action
        if action is not None and slot is not None:
            rig.animation_data.action_slot = slot
        for pb in rig.pose.bones:
            if pb.name in bones:
                pb.location, pb.rotation_quaternion, pb.scale = bones[pb.name]
        scene.frame_set(frame)

    return restore


def bind_points(body):
    """Gives the points of the mesh that Blender evaluates now (n x 3), in the bind after
    `pose_bind()`."""
    bpy.context.view_layer.update()
    ev = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    ev.to_mesh_clear()
    return co.reshape(-1, 3)


def skin_turns(body, rig):
    """Gives the 3 x 3 blend of the bone turns of each vertex for the current pose (n x 3 x 3):
    the normalized weights of the deform bones times the turn of each bone from its rest."""
    turns = {
        pb.name: np.array((pb.matrix @ pb.bone.matrix_local.inverted()).to_3x3())
        for pb in rig.pose.bones
        if pb.bone.use_deform
    }
    names = {g.index: g.name for g in body.vertex_groups}
    out = np.zeros((len(body.data.vertices), 3, 3))
    for v in body.data.vertices:
        rows = [(turns[names[g.group]], g.weight) for g in v.groups if names[g.group] in turns]
        total = sum(w for _, w in rows)
        for m, w in rows:
            out[v.index] += (w / total) * m
    return out


def add_bind_move(body, rig, move, key):
    """Adds a move of the bind points (n x 3, Blender axes) to a shape key. The inverse of the skin
    blend of each vertex turns the move back into the rest, so the bind point moves by exactly
    `move`. A new key gets the value 1. Call it after `pose_bind()`.

    Raises:
        ValueError: if the key name does not start with `bind`, because the export reads only
            the keys `bind*` as moves of the bind.
    """
    if not key.startswith('bind'):
        raise ValueError(f'The key {key} must start with bind.')
    move = np.asarray(move, float)
    moved = np.nonzero(np.linalg.norm(move, axis=1) > 0)[0]
    if body.data.shape_keys is None:
        body.shape_key_add(name='Basis', from_mix=False)
    block = body.data.shape_keys.key_blocks.get(key)
    if block is None:
        block = body.shape_key_add(name=key, from_mix=False)
        block.value = 1.0
    turns = skin_turns(body, rig)
    for i in moved:
        block.data[i].co = np.array(block.data[i].co) + np.linalg.solve(turns[i], move[i])
    body.data.update()
    return len(moved)


def neighbors(me):
    """Gives the neighbor vertex ids of each vertex of a mesh, along its edges."""
    out = [set() for _ in me.vertices]
    for e in me.edges:
        a, b = e.vertices
        out[a].add(b)
        out[b].add(a)
    return [np.array(sorted(n), int) for n in out]


def triangles(me):
    """Gives the corners (t x 3) and the face id of each triangle, as Blender divides the faces.
    The export (`tools/blender/export_rig.py`) writes the same triangles."""
    me.calc_loop_triangles()
    corners = np.array([t.vertices[:] for t in me.loop_triangles], int)
    faces = np.array([t.polygon_index for t in me.loop_triangles], int)
    return corners, faces


def part_triangles(points, corners, box=None, ids=None):
    """Gives a mask of the triangles of a part: the middle inside a box (x0, x1, y0, y1, z0, z1),
    and a corner in a list of vertex ids. A missing box or list does not limit the part."""
    keep = np.ones(len(corners), bool)
    if box is not None:
        mid = points[corners].mean(axis=1)
        lo, hi = np.array(box[0::2]), np.array(box[1::2])
        keep &= ((mid > lo) & (mid < hi)).all(axis=1)
    if ids is not None:
        keep &= np.isin(corners, np.asarray(ids, int)).any(axis=1)
    return keep


def corner_angles(points, corners):
    """Gives the three corner angles of each triangle, in degrees (t x 3)."""
    q = points[corners]
    out = []
    for a, b, c in ((0, 1, 2), (1, 2, 0), (2, 0, 1)):
        u, v = q[:, b] - q[:, a], q[:, c] - q[:, a]
        size = np.maximum(np.linalg.norm(u, axis=1) * np.linalg.norm(v, axis=1), 1e-12)
        out.append(np.degrees(np.arccos(np.clip((u * v).sum(axis=1) / size, -1.0, 1.0))))
    return np.stack(out, axis=1)


def normals(points, corners):
    """Gives the unit normal of each triangle (t x 3)."""
    q = points[corners]
    n = np.cross(q[:, 1] - q[:, 0], q[:, 2] - q[:, 0])
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)


def thin_faces(points, corners, faces, keep, small=8.0, large=160.0):
    """Gives the thin triangles of a part: a corner below `small` or above `large` degrees.

    Returns:
        Rows (triangle, face, corners, smallest angle, largest angle, middle), the thinnest first.
    """
    angles = corner_angles(points, corners)
    rows = []
    for t in np.nonzero(keep & ((angles.min(axis=1) < small) | (angles.max(axis=1) > large)))[0]:
        mid = points[corners[t]].mean(axis=0)
        rows.append(
            (int(t), int(faces[t]), corners[t].tolist(), angles[t].min(), angles[t].max(), mid)
        )
    return sorted(rows, key=lambda r: r[3])


def sharp_edges(points, corners, keep, limit=50.0):
    """Gives the sharp edges of a part: an edge of two triangles whose normals turn more than
    `limit` degrees from each other. One triangle of the two must be in the part. An edge can be
    the diagonal of a quad.

    Returns:
        Rows (angle, (a, b), concave, middle), the sharpest first. A concave edge folds toward the
        front of the faces, such as a crease. A convex edge is a ridge.
    """
    owners = {}
    for t, tri in enumerate(corners):
        for k in range(3):
            edge = tuple(sorted((int(tri[k]), int(tri[(k + 1) % 3]))))
            owners.setdefault(edge, []).append(t)
    n = normals(points, corners)
    rows = []
    for edge, tris in owners.items():
        if len(tris) != 2 or not (keep[tris[0]] or keep[tris[1]]):
            continue
        angle = math.degrees(math.acos(float(np.clip(n[tris[0]] @ n[tris[1]], -1.0, 1.0))))
        if angle <= limit:
            continue
        other = [v for v in corners[tris[1]] if v not in edge][0]
        concave = bool((points[other] - points[edge[0]]) @ n[tris[0]] > 0)
        rows.append((angle, edge, concave, (points[edge[0]] + points[edge[1]]) / 2))
    return sorted(rows, key=lambda r: -r[0])
