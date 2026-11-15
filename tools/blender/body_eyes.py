"""Holds the bead eyes of a hand rig in its `.blend` (design 4.4, "Hand rig"), in a live Blender.

    import body_eyes as se
    se.place_eyes(rig, body, {'L': (middle, direction, size), 'R': (...)})
    se.fit_eyes(rig, body)

Each eye is a mesh object `eye_L` or `eye_R` with the head bone as its parent. In the bind (the
Action `bind`), the origin of the object is the middle of the eye, its Z axis is the direction in
which the eye faces, its Y axis points up along the head, and its scale is the size of the eye: the
head height `H` of the eye, in the units of the body. `export_rig.py` reads these values
(`eye_world()`), and the app builds each eye at them with `addEye()` of `src/models/eyes.ts`.

The mesh of each object is a preview of the eye of the app, in `H` of the eye: the oval of `EYE`,
bent to the head surface by the rule of `eyeBend()` of `tools/body-module.ts`, and its light by the
rule of `addEye()`. The export reads no vertex of it. `fit_eyes()` makes the preview again, and
turns each eye about its axis so that its Y axis points up in the bind, as in the app. Run it after
each move of an eye, and after each change of the head surface.
"""

import itertools
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import body_armature as sa  # noqa: E402

#: The objects of the eyes, by side.
EYE_OBJECTS = {'L': 'eye_L', 'R': 'eye_R'}

#: The bone that carries the eyes.
EYE_BONE = 'head'

#: The size of the oval on x (across), y (up), and z (the axis), in H (`EYE` of `models/eyes.ts`).
EYE = np.array([0.13, 0.18, 0.06])

#: The faces around the axis and the rings of the oval and of the light (`addEye()`).
OVAL_BALL, LIGHT_BALL = (16, 8), (12, 6)

#: The largest turn of an oval in its plane, in radians (`EYE_ROLL_LIMIT`).
ROLL_LIMIT = math.radians(35)

#: The light in H: the diameter, the place above the middle, the depth, the place to the right of
#: the visible middle, and the largest place across (`EYE_LIGHT*` of `models/eyes.ts`).
LIGHT_SIZE, LIGHT_UP, LIGHT_DEPTH, LIGHT_SIDE, LIGHT_ACROSS = 0.04, 0.035, 0.008, 0.02, 0.04

#: The share of the move of the light toward the visible middle, and the steps of the scan of
#: the place on each side of the middle (`EYE_LIGHT_INNER`, `LIGHT_SCAN` of `models/eyes.ts`).
LIGHT_INNER, LIGHT_SCAN = 0.5, 130

#: The colors of the oval and of the light, in sRGB (`EYE_COLOR`, `EYE_LIGHT_COLOR` of
#: `models/species.ts`).
EYE_COLORS = {'eye': '#15110e', 'eye_light': '#f6f2ea'}

#: The samples of the bend on each half axis, their reach as a share of the oval, and the reach of
#: the head faces in H (`BEND_SAMPLES`, `BEND_REACH` of `tools/body-module.ts`).
BEND_SAMPLES, BEND_REACH, EYE_REACH = 6, 1.1, 0.3


def unit(v):
    """Gives a vector divided by its length."""
    return v / np.linalg.norm(v)


def ball(radius, segments, rings):
    """Gives the triangles of a ball on the y axis (triangles × 3 × 3), as `ball()` and `lathe()`
    of `src/models/primitives.ts` make them."""
    profile = []
    for k in range(rings + 1):
        angle = k / rings * math.pi
        profile.append(
            (0.0 if k in (0, rings) else radius * math.sin(angle), -radius * math.cos(angle))
        )

    def ring(r, y, i):
        a = (i + 0.5) / segments * 2 * math.pi
        return (r * math.sin(a), y, r * math.cos(a))

    out = []
    for (r0, y0), (r1, y1) in itertools.pairwise(profile):
        for i in range(segments):
            a, b = ring(r0, y0, i), ring(r0, y0, i + 1)
            c, d = ring(r1, y1, i + 1), ring(r1, y1, i)
            if r0 > 0:
                out.append((a, b, c))
            if r1 > 0:
                out.append((a, c, d))
    return np.array(out, float)


def bend_at(bend, u, v):
    """Gives the move of a bend along the axis of the eye at a place in its plane (`bendAt()`)."""
    return bend[0] * u + bend[1] * v + bend[2] * u * u + bend[3] * u * v + bend[4] * v * v


def front_depth(u, v):
    """Gives the depth of the front of the oval in front of its middle (`frontDepth()`)."""
    across, share = u / (0.5 * EYE[0]), v / (0.5 * EYE[1])
    return 0.5 * EYE[2] * math.sqrt(max(0.0, 1 - across * across - share * share))


def light_across(across_x, n_x, front, lift):
    """Gives the place of the light across the eye (`lightAcross()`). `across_x` and `n_x` are the
    x of the axis across the eye and of the axis of the eye in the model axes of the app, and
    `lift` is the move of the light to +x from its height up the oval."""
    if abs(across_x) < 0.2:
        return 0.0

    def place(side, mirror):
        nx = mirror * n_x
        target = -LIGHT_INNER * nx * front(0.0) + side - mirror * lift
        places = [k / LIGHT_SCAN * 0.5 * EYE[0] for k in range(-LIGHT_SCAN, LIGHT_SCAN + 1)]
        return min(places, key=lambda u: abs(u * across_x + nx * front(mirror * u) - target))

    side = LIGHT_SIDE
    for _ in range(10):
        if max(abs(place(side, 1)), abs(place(side, -1))) <= LIGHT_ACROSS:
            break
        side *= 0.8
    return min(LIGHT_ACROSS, max(-LIGHT_ACROSS, place(side, 1)))


def front_lean(across, up):
    """Gives the lean of the long axis of an oval in the front view of the app (`frontLean()`).
    `across` and `up` are the x and the y of the app of the axes of the oval, with the bend."""
    a2, b2 = (0.5 * EYE[0]) ** 2, (0.5 * EYE[1]) ** 2
    xx = across[0] ** 2 * a2 + up[0] ** 2 * b2
    yy = across[1] ** 2 * a2 + up[1] ** 2 * b2
    xy = across[0] * across[1] * a2 + up[0] * up[1] * b2
    return 0.5 * math.atan2(2 * xy, yy - xx)


def upright_roll(across, up, n, bend):
    """Gives the turn of an oval in its plane that makes it upright in the front view of the app
    (`uprightRoll()`). `across`, `up`, and `n` are the x and the y of the app of the axes."""
    a = np.asarray(across) + bend[0] * np.asarray(n)
    b = np.asarray(up) + bend[1] * np.asarray(n)

    def lean(roll):
        c, s = math.cos(roll), math.sin(roll)
        return front_lean(c * a + s * b, c * b - s * a)

    roll, d = 0.0, 1e-4
    for _ in range(6):
        slope = (lean(roll + d) - lean(roll - d)) / (2 * d)
        if abs(slope) < 1e-6:
            break
        roll = min(ROLL_LIMIT, max(-ROLL_LIMIT, roll - lean(roll) / slope))
    return roll


def eye_parts(bend, app_axes):
    """Gives the triangles of the oval and of the light of an eye in its own axes, in H, as
    `addEye()` and `addBentLight()` make them: x across, y up, and z the axis of the eye. The oval
    and the light turn in the plane of the eye by `upright_roll()`. `app_axes` holds the x and the
    y of the app of the axes across, up, and of the eye."""
    roll = upright_roll(*app_axes, bend)
    c, s = math.cos(roll), math.sin(roll)
    # The turn from the axes of the oval to the axes of the eye object.
    turn = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1.0]])

    def bend_of(u, v):
        return bend_at(bend, u * c - v * s, u * s + v * c)

    oval = ball(0.5, *OVAL_BALL) * EYE
    oval[..., 2] += bend_of(oval[..., 0], oval[..., 1])

    def front(u, at):
        return front_depth(u, at) + bend_of(u, at)

    across_x = c * app_axes[0][0] + s * app_axes[1][0]
    v, d = LIGHT_UP, 1e-4
    up_x = c * app_axes[1][0] - s * app_axes[0][0]
    u = light_across(across_x, app_axes[2][0], lambda place: front(place, v), v * up_x)
    slope_u = (front(u + d, v) - front(u - d, v)) / (2 * d)
    slope_v = (front(u, v + d) - front(u, v - d)) / (2 * d)
    facing = unit(np.array([-slope_u, -slope_v, 1.0]))
    up = np.array([0.0, 1, 0])
    up = unit(up - (up @ facing) * facing)
    disc = np.column_stack([np.cross(up, facing), up, facing])
    light = ball(0.5, *LIGHT_BALL) * [LIGHT_SIZE, LIGHT_SIZE, LIGHT_DEPTH]
    light = light @ disc.T + [u, v, front(u, v)]
    return oval @ turn.T, light @ turn.T


def eye_frame(direction):
    """Gives the axes of an eye that faces `direction`, in Blender axes, as the columns across, up,
    and the axis: up is +Z along the plane of the eye, as in `addEye()`."""
    n = unit(np.asarray(direction, float))
    up = unit(np.array([0.0, 0, 1]) - n[2] * n)
    return np.column_stack([np.cross(up, n), up, n])


def parent_world(rig, worlds):
    """Gives the matrix of the parent of an eye in a pose: the head bone of `worlds` moved to its
    tail, as Blender places a child of a bone."""
    tail = np.eye(4)
    tail[1, 3] = rig.data.bones[EYE_BONE].length
    return worlds[EYE_BONE] @ tail


def eye_world(rig, eye, worlds):
    """Gives the world matrix of an eye object in the pose of `worlds` (`sa.action_worlds()`), in
    64-bit floats, with no change of the pose of Blender."""
    return parent_world(rig, worlds) @ sa.m64(eye.matrix_parent_inverse) @ sa.m64(eye.matrix_basis)


def bind_worlds(rig):
    """Gives the world matrix of each bone in the bind (the Action `bind`)."""
    return sa.action_worlds(rig, bpy.data.actions['bind'])


def set_bind(rig, eye, middle, frame, size, worlds):
    """Sets the transform of an eye object so that in the bind its origin is `middle`, its axes
    are the columns of `frame`, and its scale is `size`."""
    world = np.eye(4)
    world[:3, :3] = frame * size
    world[:3, 3] = middle
    eye.matrix_parent_inverse = Matrix.Identity(4)
    eye.matrix_basis = Matrix(np.linalg.solve(parent_world(rig, worlds), world).tolist())


def eye_material(name):
    """Gives the material of a part of the preview: the color of the app with a wet finish."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    value = int(EYE_COLORS[name][1:], 16)
    srgb = [(value >> s & 0xFF) / 255 for s in (16, 8, 0)]
    rgb = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    mat.diffuse_color = (*rgb, 1)
    bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (*rgb, 1)
        bsdf.inputs['Roughness'].default_value = 0.2
    return mat


def surface_height(tris, normals, base, axis, reach):
    """Gives the height of the head surface along the axis of an eye at a place of the plane of the
    eye (`surfaceHeight()` of `tools/body-module.ts`): the crossing of the line with an outer face
    nearest to the plane, or None."""
    keep = normals @ axis > 0
    a, b, c = tris[keep, 0], tris[keep, 1], tris[keep, 2]
    origin = base - axis * reach
    e1, e2 = b - a, c - a
    p = np.cross(axis, e2)
    det = (e1 * p).sum(1)
    det = np.where(np.abs(det) < 1e-15, np.nan, det)
    s = origin - a
    u = (s * p).sum(1) / det
    q = np.cross(s, e1)
    v = (q @ axis) / det
    t = (e2 * q).sum(1) / det
    height = t - reach
    hit = (u >= 0) & (v >= 0) & (u + v <= 1) & (t >= 0) & (np.abs(height) <= reach)
    if not hit.any():
        return None
    return float(height[hit][np.argmin(np.abs(height[hit]))])


def eye_bend(tris, normals, middle, frame, h):
    """Gives the bend of an eye at `middle` (`eyeBend()` of `tools/body-module.ts`), from the head
    surface under the middle along the axis, in H, or no bend when the axis meets no head face."""
    across, up, n = frame.T
    crossing = surface_height(tris, normals, middle, n, EYE_REACH * h)
    if crossing is None:
        return np.zeros(5)
    surface = middle + n * crossing
    rows, heights = [], []
    for i in range(-BEND_SAMPLES, BEND_SAMPLES + 1):
        for j in range(-BEND_SAMPLES, BEND_SAMPLES + 1):
            a, b = i / BEND_SAMPLES, j / BEND_SAMPLES
            if a * a + b * b > 1:
                continue
            u, v = 0.5 * EYE[0] * BEND_REACH * a, 0.5 * EYE[1] * BEND_REACH * b
            height = surface_height(
                tris, normals, surface + (across * u + up * v) * h, n, EYE_REACH * h
            )
            if height is not None:
                rows.append([u, v, u * u, u * v, v * v])
                heights.append(height / h)
    if len(rows) < 12:
        return np.zeros(5)
    return np.linalg.lstsq(np.array(rows), np.array(heights), rcond=None)[0]


def head_faces(body, middle, reach):
    """Gives the triangles of the evaluated mesh near a point and their normals, in world axes."""
    ev = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    me.calc_loop_triangles()
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3) @ sa.m64(body.matrix_world)[:3, :3].T + sa.m64(body.matrix_world)[:3, 3]
    tris = co[np.array([t.vertices[:] for t in me.loop_triangles])]
    ev.to_mesh_clear()
    near = np.linalg.norm(tris.mean(1) - middle, axis=1) < reach
    tris = tris[near]
    normals = np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0])
    return tris, normals


def preview(rig, body, eye, worlds):
    """Makes the preview mesh of an eye object: the oval and the light of the app, bent to the head
    surface of the evaluated mesh in the current pose. Gives the bend."""
    bpy.context.view_layer.update()
    world = sa.m64(eye.matrix_world)
    size = float(np.linalg.norm(world[:3, :3], axis=0).mean())
    frame, middle = world[:3, :3] / size, world[:3, 3]
    tris, normals = head_faces(body, middle, 2 * EYE_REACH * size)
    bend = eye_bend(tris, normals, middle, frame, size)
    # The front view of the app looks along -Y of Blender, with the left side of the animal at -x
    # and up at +Z: the x of the app is -X, and its y is Z.
    axes = eye_world(rig, eye, worlds)[:3, :3] / size
    app_axes = [(-axes[0, k], axes[2, k]) for k in range(3)]
    oval, light = eye_parts(bend, app_axes)
    me = eye.data
    me.clear_geometry()
    parts = np.concatenate([oval, light])
    me.from_pydata(
        parts.reshape(-1, 3).tolist(), [], np.arange(len(parts) * 3).reshape(-1, 3).tolist()
    )
    me.materials.clear()
    for name in EYE_COLORS:
        me.materials.append(eye_material(name))
    me.polygons.foreach_set('material_index', [0] * len(oval) + [1] * len(light))
    me.shade_flat()
    me.update()
    return bend


def place_eyes(rig, body, eyes):
    """Puts the eye objects at `eyes`, by side (middle, direction, size) in the bind and in Blender
    axes, with the head bone as their parent, and makes their previews (`fit_eyes()`)."""
    worlds = bind_worlds(rig)
    for side, (middle, direction, size) in eyes.items():
        name = EYE_OBJECTS[side]
        eye = bpy.data.objects.get(name)
        if eye is None:
            eye = bpy.data.objects.new(name, bpy.data.meshes.new(name))
            (body.users_collection or [bpy.context.scene.collection])[0].objects.link(eye)
        eye.parent, eye.parent_type, eye.parent_bone = rig, 'BONE', EYE_BONE
        set_bind(rig, eye, np.asarray(middle, float), eye_frame(direction), size, worlds)
    return fit_eyes(rig, body)


def fit_eyes(rig, body):
    """Turns each eye object about its axis so that its Y axis points up in the bind, as in the
    app, keeps its middle, its direction, and its size, and makes its preview again. Gives the
    bend of each eye."""
    worlds = bind_worlds(rig)
    out = {}
    for side, name in EYE_OBJECTS.items():
        eye = bpy.data.objects[name]
        world = eye_world(rig, eye, worlds)
        size = float(np.linalg.norm(world[:3, :3], axis=0).mean())
        set_bind(rig, eye, world[:3, 3], eye_frame(world[:3, 2]), size, worlds)
        out[side] = preview(rig, body, eye, worlds)
    return out
