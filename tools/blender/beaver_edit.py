"""Frees the arms of a copy of the beaver mesh from the trunk (design 4.4, "Source meshes").

The upper arm of `beaver.glb` joins the side of the trunk from the shoulder down to the elbow, so
`arm_rebuild.py` finds no closed loop around the upper arm. This script frees each arm in a copy,
`beaver-edit.glb`, so that `arm_rebuild.py` rebuilds it as the arm of any body. The side wall of
the trunk under the arm follows `step_round_wall()` of `cat_arms.py`:

1. Import the source and Merge by Distance (`violin_arms.import_mesh()`).
2. Split the edges of the crease where the arm meets the trunk (`SEAMS`, `step_rip()`).
3. Turn the arm out about the forward axis through the shoulder joint, and shift it out and up,
   with a ramp along the upper arm (`step_turn()`). A turn alone does not open the front crease,
   because its top lies on the axis of the turn. The two copies of a seam vertex that part by
   less than `JOIN` join again, so that the hole starts where it opens.
4. Close the arm with an armpit line and a grid of quads on the arm lip (`step_fill()`).
5. Close the trunk with a side wall on the plane of the seam: a Delaunay fill of the hole, a
   smooth along the normal of the plane, and a relax of the wall (`step_wall()`).
6. Smooth the pockets of the trunk that the arm hid (`step_pocket()`).
7. Smooth the old crease on the arm, and round the inner side of the arm, so that the Shrinkwrap
   of `arm_rebuild.py` puts the tube on the arm and not on the wall (`step_fair()`,
   `step_round()`).
8. Give the new faces the fur colors beside them (`step_color()`), and write the copy.

The script prints the joints of the left arm of the rig config after the turn, for arms
`--factor` times longer than the arms of the source (`turned_joints()`). The joints of the config
before the edit are the joints of the source mesh.

Run it in a terminal from the root of the tree:

    blender -b --factory-startup -P tools/blender/beaver_edit.py -- <out.glb> [--factor <f>]

Two runs give the same bytes: the script runs Blender again with `PYTHONHASHSEED=0`, as
`arm_rebuild.py` does. In the live Blender of MCP, call the steps one at a time.
"""

import json
import math
import os
import subprocess
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import arm_rebuild as ar  # noqa: E402

va = ar.va

#: The seam of each arm: the chain of concave edges where the arm meets the trunk, from the top
#: of the back crease, down to the armpit under the elbow, and up the front crease. Each end lies
#: above the shoulder joint, so that the arm of the turn ends at the seam (`arm_region()`). The
#: chain is the shortest edge path through the concave edges from the back end over the lowest
#: point to the front end. Vertex indices of the welded source (`violin_arms.import_mesh()`).
SEAMS = {
    1: [624, 628, 629, 630, 632, 597, 594, 488, 484, 485, 614, 159],
    -1: [806, 807, 804, 805, 799, 790, 789, 788, 795, 794, 665, 666, 671, 667, 668, 674, 677, 274],
}

#: The turn of each arm out from the trunk, in degrees, about the forward axis through the
#: shoulder joint.
TURN = 10.0

#: The shift of each arm out and up, at a right angle to the turned upper arm, in units.
SHIFT = 0.018

#: The shares of the upper arm over which the turn grows from 0 to its full angle.
RAMP = (0.05, 0.45)

#: The arm of the turn: the vertices from this share of the upper arm on, on the arm side of the
#: seam (`arm_region()`).
FLOOD = 0.0

#: The two copies of a seam vertex that part by less than this distance in units join again.
JOIN = 0.005

#: The smooth of the old crease on the arm (`step_fair()`): the rounds and the factors of Smooth
#: Vertices.
FAIR_SMOOTH = 4
FAIR_FACTOR = (0.5,)

#: The share of the way from the flat inner side of each arm to a round arm (`step_round()`).
ROUND = 0.6

#: The side wall of the trunk (`step_wall()`), with the keys of `wall` of `cat_arms.py`: the side
#: of the triangles of the wall in units, the rings of trunk vertices around the wall that move,
#: within `reach` units of a vertex of the wall, the rounds of the smooth, and the largest depth
#: of a vertex of the wall in the trunk.
WALL = {'inset': 0.015, 'lip': 0.7, 'depth': 0.03, 'grid': 0.016, 'rings': 4, 'reach': 0.05,
        'rounds': 6, 'deep': 0.006, 'relax': 8}

#: The smooth of the pockets of the trunk that the arm hid (`step_pocket()`).
POCKET = {'angle': 40.0, 'reach': 0.08, 'ball': 0.05, 'rounds': 10}

#: The codes of the vertex attribute `edit_part`: the trunk, the turned arm, the armpit line,
#: the new faces of the arm, the new faces of the trunk, the lip of the arm, the lip of the
#: trunk, and the two ends of the armpit line.
TRUNK, ARM, PIT, ARM_FILL, TRUNK_FILL, ARM_LIP, TRUNK_LIP, APEX = 0, 1, 2, 3, 4, 5, 6, 7


#: The joints of the left arm of the source mesh, in the units of the studio: the joints of the
#: rig config before the edit. The config now holds the joints of the turned and longer arms, so
#: the edit keeps its own.
SOURCE_ARM = {
    'upper_arm_L': {'head': [0.175, 0.615, 0.105]},
    'forearm_L': {'head': [0.228, 0.52, 0.163]},
    'forearm_twist_L': {'head': [0.2505, 0.484, 0.191]},
    'hand_L': {'head': [0.273, 0.448, 0.219]},
    'fingers_L': {'head': [0.29, 0.4, 0.235], 'tail': [0.291, 0.3615, 0.245]},
}


def session():
    """Gives a session of `arm_rebuild.py` on the source mesh of the beaver, with the arm joints
    of the source (`SOURCE_ARM`)."""
    s = ar.Session('beaver', source='assets/models/beaver/beaver.glb')
    for name, joint in SOURCE_ARM.items():
        s.joints[name] = dict(s.joints[name], **joint)
    return s


def share(s, side, co):
    """Gives the share of the upper arm of a point: its projection on the bone from the shoulder
    joint, over the length of the bone."""
    a, e, _, _ = va.arm_line(s, side)
    return (co - a).dot((e - a).normalized()) / (e - a).length


#: The flap faces of the source on a seam: a face of an edge with three faces, with two open edges
#: of its own (the small spot of the left armpit, `README.md`). The rip removes them first.
FLAPS = ((484, 487, 488),)

#: The open edges of the source in the whisker roots lie above this height in units. The holes of
#: the seams lie below it (`open_edges()`).
HOLE_TOP = 0.75


def open_edges(s, bm, side):
    """Gives the open edges of the holes of one side: the open edges below `HOLE_TOP`."""
    top = s.fr.point((0, HOLE_TOP, 0)).z
    return [x for x in bm.edges if x.is_boundary and x.verts[0].co.x * side > 0
            and max(p.co.z for p in x.verts) < top]


def step_rip(s):
    """Removes the flap faces (`FLAPS`), and splits the edges of each seam, so that the arm and the
    trunk part along the seam."""
    bm = bmesh.new()
    bm.from_mesh(s.mesh.data)
    bm.verts.ensure_lookup_table()
    out, seams = {}, {}
    flaps = [bm.faces.get([bm.verts[i] for i in face]) for face in FLAPS]
    if any(f is None for f in flaps):
        raise RuntimeError('A flap of FLAPS is no face of the source.')
    for side, chain in SEAMS.items():
        verts = [bm.verts[i] for i in chain]
        edges = [bm.edges.get((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
        if any(edge is None for edge in edges):
            raise RuntimeError('The seam of the side %d is no edge chain.' % side)
        seams[side] = edges
    # Flaps can share corners, so each corner goes into the list one time.
    loose = list(dict.fromkeys(p for f in flaps for p in f.verts))
    bmesh.ops.delete(bm, geom=flaps, context='FACES_ONLY')
    bmesh.ops.delete(bm, geom=[p for p in loose if not p.link_faces], context='VERTS')
    out['flaps'] = len(flaps)
    for side, edges in seams.items():
        bmesh.ops.split_edges(bm, edges=edges)
        out[side] = len(edges)
    bm.to_mesh(s.mesh.data)
    bm.free()
    return out


def arm_region(s, bm, side):
    """Gives the vertices of one arm after the rip: a flood from the vertex nearest to the middle
    of the forearm over the edges, with no step to a vertex before `FLOOD` of the upper arm. A
    vertex nearer to the middle plane than the arm zone of `arm_rebuild.py` stops the edit."""
    _, e, w, _ = va.arm_line(s, side)
    mid = e.lerp(w, 0.5)
    seed = min(bm.verts, key=lambda p: (p.co - mid).length)
    near_x = s.units(ar.ZONE_X * abs(s.joints['upper_arm_L']['head'][0]))
    arm, stack = {seed}, [seed]
    while stack:
        p = stack.pop()
        if p.co.x * side < near_x:
            raise RuntimeError('The arm of the side %d joins the trunk.' % side)
        for edge in p.link_edges:
            q = edge.other_vert(p)
            if q not in arm and share(s, side, q.co) >= FLOOD:
                arm.add(q)
                stack.append(q)
    return arm


def smoothstep(x, lo, hi):
    """Gives the smooth step from 0 at `lo` to 1 at `hi`."""
    t = max(0.0, min(1.0, (x - lo) / (hi - lo)))
    return t * t * (3 - 2 * t)


def turn_of(s, side):
    """Gives the full turn of one arm (a matrix) and its shift (a vector in Blender)."""
    a, e, _, _ = va.arm_line(s, side)
    full = Matrix.Rotation(math.radians(-side * TURN), 3, Vector((0, 1, 0)))
    u = full @ (e - a).normalized()
    # The shift goes out and up, at a right angle to the turned upper arm in the front view.
    lift = Vector((-u.z, 0.0, u.x)).normalized() * side * SHIFT * s.fr.height
    return full, lift


def turned_line(s, side):
    """Gives the shoulder, the elbow, the wrist, and the finger tip of one arm after the turn."""
    a, e, w, t = va.arm_line(s, side)
    full, lift = turn_of(s, side)
    return [a] + [a + full @ (p - a) + lift for p in (e, w, t)]


def step_turn(s):
    """Turns each arm out about the forward axis through its shoulder joint by `TURN`, and shifts
    it by `SHIFT`, each times the ramp of `RAMP` along the upper arm. Joins the copies of the seam
    vertices that part by less than `JOIN`. Gives the vertices of each arm and the counts."""
    bm = bmesh.new()
    bm.from_mesh(s.mesh.data)
    part = bm.verts.layers.int.get('edit_part') or bm.verts.layers.int.new('edit_part')
    out = {}
    seam = [p for p in bm.verts if p.is_boundary]
    # The two copies of each split seam vertex lie at one point before the turn.
    twins = {}
    for p in seam:
        for q in seam:
            if q is not p and (q.co - p.co).length < 1e-9:
                twins[p] = q
    for side in (1, -1):
        a = va.arm_line(s, side)[0]
        _, lift = turn_of(s, side)
        arm = arm_region(s, bm, side)
        for p in arm:
            k = smoothstep(share(s, side, p.co), *RAMP)
            turn = Matrix.Rotation(math.radians(-side * TURN * k), 3, Vector((0, 1, 0)))
            p.co = a + turn @ (p.co - a) + lift * k
            p[part] = ARM
        out[side] = len(arm)
    # The two copies of a seam vertex that part by less than `JOIN` join again at the trunk copy,
    # so that the hole starts where it is open.
    joins = {}
    for p, mate in twins.items():
        if p[part] == ARM or (mate[part] != ARM and p.index > mate.index):
            if (mate.co - p.co).length < JOIN * s.fr.height:
                joins[p] = mate
    bmesh.ops.weld_verts(bm, targetmap=joins)
    out['joined'] = len(joins)
    out['open'] = sum(1 for p in bm.verts if p.is_boundary)
    bm.to_mesh(s.mesh.data)
    bm.free()
    s.mesh.data.update()
    return out


def hole(s, bm, side):
    """Gives the boundary loop of the open seam of one side, in order."""
    adj = {}
    for edge in open_edges(s, bm, side):
        for p in edge.verts:
            adj.setdefault(p, []).append(edge.other_vert(p))
    start = min(adj, key=lambda p: p.index)
    loop, prev, cur = [start], None, start
    while True:
        nxt = adj[cur][0] if adj[cur][0] is not prev else adj[cur][1]
        if nxt is start:
            return loop
        loop.append(nxt)
        prev, cur = cur, nxt


def lips(s, bm, side):
    """Splits the hole of one side into the lip of the arm and the lip of the trunk. Gives the
    front and the back apex (the vertices where the two lips meet), the arm lip from the front
    apex to the back apex, and the trunk lip from the back apex to the front apex."""
    part = bm.verts.layers.int['edit_part']
    loop = hole(s, bm, side)
    n = len(loop)
    arm = [k for k in range(n) if loop[k][part] == ARM]
    # The first vertex of the arm run: its loop neighbor before it is no arm vertex.
    first = next(k for k in arm if loop[(k - 1) % n][part] != ARM)
    count = len(arm)
    run = [loop[(first - 1 + i) % n] for i in range(count + 2)]
    rest = [loop[(first + count + i) % n] for i in range(n - count)]
    if -run[0].co.y < -run[-1].co.y:
        run.reverse()
        rest.reverse()
    return run[0], run[-1], run, rest


def grid_patch(bm, top, left, right, bottom, code):
    """Fills a hole with a grid of quads. `top` and `bottom` are rows of equal length, and `left`
    and `right` are columns of equal length, all as lists of vertices: `left` goes from top[0] to
    bottom[0], and `right` from top[-1] to bottom[-1]. The inner vertices lie on the Coons patch
    of the four sides. Gives the new vertices and the new faces."""
    part = bm.verts.layers.int['edit_part']
    fill = bm.faces.layers.int.get('edit_fill') or bm.faces.layers.int.new('edit_fill')
    rows, cols = len(left) - 1, len(top) - 1
    grid = [[None] * (cols + 1) for _ in range(rows + 1)]
    for j in range(cols + 1):
        grid[0][j], grid[rows][j] = top[j], bottom[j]
    for i in range(rows + 1):
        grid[i][0], grid[i][cols] = left[i], right[i]
    made = []
    for i in range(1, rows):
        v = i / rows
        for j in range(1, cols):
            u = j / cols
            co = ((1 - v) * top[j].co + v * bottom[j].co + (1 - u) * left[i].co + u * right[i].co
                  - (1 - u) * (1 - v) * top[0].co - u * (1 - v) * top[cols].co
                  - (1 - u) * v * bottom[0].co - u * v * bottom[cols].co)
            p = bm.verts.new(co)
            p[part] = code
            grid[i][j] = p
            made.append(p)
    faces = []
    for i in range(rows):
        for j in range(cols):
            quad = (grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j])
            face = bm.faces.new(quad)
            face.smooth = True
            face[fill] = code
            faces.append(face)
    return made, faces


def pit_count(arm, trunk, front, back):
    """Gives the number of edges of the armpit line: about the edge length of the lips, and with
    the parity of both lips, so that each patch is a grid."""
    edges = len(arm) + len(trunk) - 2
    step = (sum((arm[i + 1].co - arm[i].co).length for i in range(len(arm) - 1))
            + sum((trunk[i + 1].co - trunk[i].co).length for i in range(len(trunk) - 1))) / edges
    p = max(2, round((front.co - back.co).length / step))
    while (len(arm) - 1 - p) % 2 or (len(trunk) - 1 - p) % 2:
        p += 1
    return p


def step_fill(s):
    """Closes the arm of each side: an armpit line from the front apex to the back apex, and a grid
    patch of quads on the arm lip (`grid_patch()`). The trunk lip stays open for `step_wall()`."""
    bm = bmesh.new()
    bm.from_mesh(s.mesh.data)
    part = bm.verts.layers.int['edit_part']
    out = {}
    for side in (1, -1):
        front, back, arm, trunk = lips(s, bm, side)
        p = pit_count(arm, arm, front, back)
        pit = [front]
        for i in range(1, p):
            v = bm.verts.new(front.co.lerp(back.co, i / p))
            v[part] = PIT
            pit.append(v)
        pit.append(back)
        front[part] = back[part] = APEX
        for v in arm[1:-1]:
            v[part] = ARM_LIP
        for v in trunk[1:-1]:
            v[part] = TRUNK_LIP
        for i in range(p):
            bm.edges.new((pit[i], pit[i + 1]))
        n = len(arm) - 1
        k = (n - p) // 2
        made = grid_patch(bm, pit, arm[:k + 1], arm[::-1][:k + 1], arm[k:k + p + 1], ARM_FILL)
        orient(bm, made[1])
        out[side] = {'pit': p, 'arm': len(made[1])}
    bm.normal_update()
    bm.to_mesh(s.mesh.data)
    bm.free()
    s.mesh.data.update()
    return out


def orient(bm, faces):
    """Turns the faces of a new patch so that they wind as the old faces beside them: the two
    faces of an edge go along it in opposite directions."""
    new = set(faces)
    for f in faces:
        for loop in f.loops:
            other = [g for g in loop.edge.link_faces if g not in new]
            if other:
                theirs = next(lp for lp in other[0].loops if lp.edge is loop.edge)
                if theirs.vert is loop.vert:
                    bmesh.ops.reverse_faces(bm, faces=faces)
                return


#: The joints of the left arm that turn with it, as keys of `joints` of the rig config.
ARM_JOINTS = (('forearm_L', 'head'), ('forearm_twist_L', 'head'), ('hand_L', 'head'),
              ('fingers_L', 'head'), ('fingers_L', 'tail'))


def turned_joints(joints, factor):
    """Gives the joints of the left arm of the rig config after the turn and the shift, in the
    units of the studio, for arms `factor` times longer (`violin_arms.source_joints()` gives them
    back). `joints` are the joints of the source mesh. The upper arm keeps its length: the
    elbow lies on the line from the shoulder joint to the turned and shifted elbow, and the
    forearm and the paw move with it."""
    shoulder = Vector(joints['upper_arm_L']['head'])
    # Blender turns the left arm about +y by -TURN. In the studio, x stays x and the height y is
    # Blender z, so the turn moves the arm out and up.
    turn = Matrix.Rotation(math.radians(TURN), 3, Vector((0, 0, 1)))
    elbow = Vector(joints['forearm_L']['head'])
    u = turn @ (elbow - shoulder).normalized()
    lift = Vector((-u.y, u.x, 0.0)).normalized() * SHIFT
    moved = {(name, key): shoulder + turn @ (Vector(joints[name][key]) - shoulder) + lift
             for name, key in ARM_JOINTS}
    length = (elbow - shoulder).length
    e = shoulder + (moved[('forearm_L', 'head')] - shoulder).normalized() * length
    fix = e - moved[('forearm_L', 'head')]
    moved = {k: v + fix for k, v in moved.items()}
    # The longer arms of the rig: the elbow moves out along the upper arm, and the wrist along the
    # forearm, as `violin_arms.source_joints()` takes them back.
    e2 = shoulder + (e - shoulder) * factor
    w = moved[('hand_L', 'head')]
    w2 = e2 + (w - e) * factor
    out = {
        ('forearm_L', 'head'): e2,
        ('forearm_twist_L', 'head'): e2 + (moved[('forearm_twist_L', 'head')] - e) * factor,
        ('hand_L', 'head'): w2,
        ('fingers_L', 'head'): moved[('fingers_L', 'head')] + (w2 - w),
        ('fingers_L', 'tail'): moved[('fingers_L', 'tail')] + (w2 - w),
    }
    return {k: [round(c, 6) for c in v] for k, v in out.items()}


def step_export(s, path):
    """Writes the mesh as a GLB file, as `arm_root.py` does. Gives the size of the file."""
    bpy.ops.object.select_all(action='DESELECT')
    s.mesh.select_set(True)
    bpy.context.view_layer.objects.active = s.mesh
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True)
    return os.path.getsize(path)


def step_color(s):
    """Gives the new faces their fur colors. The new faces of each arm take one color, as
    `step_inner_color()` of `cat_arms.py` does: each corner takes the UV middle of the old face
    beside them whose texture color is nearest to the median color of these old faces. Each face
    of the wall and each old face at the trunk lip below the armpit line takes the UV middle of
    the nearest trunk face with no vertex within one edge of the lip. Gives the count of the faces
    of the wall and the lip, and the median colors of the arms."""
    import numpy as np

    bm = bmesh.new()
    bm.from_mesh(s.mesh.data)
    part = bm.verts.layers.int['edit_part']
    fill = bm.faces.layers.int['edit_fill']
    uv = bm.loops.layers.uv.active
    mat = s.mesh.data.materials[0]
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    image = bsdf.inputs['Base Color'].links[0].from_node.image
    width, height = image.size
    pixels = np.empty(width * height * 4, np.float32)
    image.pixels.foreach_get(pixels)
    pixels = pixels.reshape(height, width, 4)[:, :, :3]

    def middle(f):
        return sum((lp[uv].uv for lp in f.loops), Vector((0, 0))) / len(f.loops)

    def color(at):
        return pixels[min(int(at.y % 1.0 * height), height - 1),
                      min(int(at.x % 1.0 * width), width - 1)]

    lips = {ARM_FILL: (ARM_LIP, ARM)}
    out = {}
    # The wall and the old faces at the trunk lip below the armpit line take the color of the
    # nearest trunk face away from the lip: the old crease faces carry the black fur of the arm.
    pit = min(p.co.z for p in bm.verts if p[part] in (PIT, APEX))
    rim = [f for f in bm.faces if f[fill] == TRUNK_FILL
           or (not f[fill] and any(p[part] == TRUNK_LIP for p in f.verts)
               and f.calc_center_median().z < pit)]
    far = [f for f in bm.faces if not f[fill]
           and all(p[part] == TRUNK for p in f.verts)
           and not any(q[part] == TRUNK_LIP for p in f.verts for x in p.link_edges
                       for q in [x.other_vert(p)])]
    centers = [(f.calc_center_median(), middle(f)) for f in far]
    for f in rim:
        center = f.calc_center_median()
        _, at = min(centers, key=lambda m: (m[0] - center).length)
        for lp in f.loops:
            lp[uv].uv = at
    out['rim'] = len(rim)
    for side in (1, -1):
        for code, codes in lips.items():
            new = [f for f in bm.faces if f[fill] == code and f.calc_center_median().x * side > 0]
            region = {p for f in new for p in f.verts}
            beside = [g for p in region for g in p.link_faces
                      if not g[fill] and all(q[part] in codes + (APEX,) for q in g.verts)]
            beside = list(dict.fromkeys(beside))
            colors = np.array([color(middle(g)) for g in beside])
            median = np.median(colors, axis=0)
            pick = beside[int(np.argmin(np.linalg.norm(colors - median, axis=1)))]
            at = middle(pick)
            for f in new:
                for lp in f.loops:
                    lp[uv].uv = at
            out[(side, code)] = [round(float(c), 3) for c in median]
    bm.to_mesh(s.mesh.data)
    bm.free()
    return out


def rings_of(verts, count):
    """Gives the vertices within `count` edge steps of a set of vertices, without the set."""
    seen, edge = set(verts), set(verts)
    for _ in range(count):
        edge = {q for p in edge for q in (e.other_vert(p) for e in p.link_edges)} - seen
        seen |= edge
    return seen - set(verts)


def step_fair(s):
    """Smooths the old crease on the arm of each side with Smooth Vertices (`FAIR_SMOOTH` rounds of
    each factor of `FAIR_FACTOR`): the new faces of the arm and the arm lip move, and the armpit
    line stays. Gives the largest move of each side in units."""
    bm = bmesh.new()
    bm.from_mesh(s.mesh.data)
    part = bm.verts.layers.int['edit_part']
    start = {p: p.co.copy() for p in bm.verts}
    out = {}
    for side in (1, -1):
        verts = [p for p in bm.verts if p[part] in (ARM_FILL, ARM_LIP) and p.co.x * side > 0]
        for _ in range(FAIR_SMOOTH):
            for factor in FAIR_FACTOR:
                bmesh.ops.smooth_vert(bm, verts=verts, factor=factor, use_axis_x=True,
                                      use_axis_y=True, use_axis_z=True)
        out[side] = round(max((p.co - start[p]).length for p in verts) / s.fr.height, 4)
    bm.normal_update()
    bm.to_mesh(s.mesh.data)
    bm.free()
    return out


def step_round(s):
    """Rounds the new faces of each arm: each inner vertex moves out from the arm line by the share
    `ROUND` of the way to the mean distance of the arm lip from the arm line. The flat inner side
    of the arm then lies near the rings of the tube of `arm_rebuild.py`, so that its Shrinkwrap
    puts the tube on the arm and not on the side wall. Gives the largest move of each side in
    units."""
    bm = bmesh.new()
    bm.from_mesh(s.mesh.data)
    part = bm.verts.layers.int['edit_part']
    out = {}
    for side in (1, -1):
        line = turned_line(s, side)

        def foot(co):
            best = None
            for a, b in zip(line, line[1:]):
                ab = b - a
                t = max(0.0, min(1.0, (co - a).dot(ab) / ab.length_squared))
                q = a + ab * t
                if best is None or (co - q).length < (co - best).length:
                    best = q
            return best

        lip = [p for p in bm.verts if p[part] == ARM_LIP and p.co.x * side > 0]
        radius = sum((p.co - foot(p.co)).length for p in lip) / len(lip)
        most = 0.0
        for p in [q for q in bm.verts if q[part] == ARM_FILL and q.co.x * side > 0]:
            q = foot(p.co)
            d = (p.co - q).length
            target = q + (p.co - q).normalized() * (d + (radius - d) * ROUND)
            if d < radius:
                most = max(most, (target - p.co).length)
                p.co = target
        out[side] = round(most / s.fr.height, 4)
    bm.normal_update()
    bm.to_mesh(s.mesh.data)
    bm.free()
    return out


def step_pocket(s):
    """Smooths the pockets of the trunk that the arm hid: each sharp edge of the trunk (a turn of at
    least `POCKET['angle']` degrees) within `POCKET['reach']` units of the trunk lip, with its
    vertices and one ring around them, and the trunk within `POCKET['ball']` units of the lowest
    point of the lip, take `POCKET['rounds']` Taubin rounds of Smooth Vertices.
    The armpit line stays. Gives the count of the sharp edges and the largest move of each side in
    units."""
    bm = bmesh.new()
    bm.from_mesh(s.mesh.data)
    bm.normal_update()
    part = bm.verts.layers.int['edit_part']
    trunk = (TRUNK, TRUNK_LIP, TRUNK_FILL)
    out = {}
    for side in (1, -1):
        lip = [p.co.copy() for p in bm.verts if p[part] == TRUNK_LIP and p.co.x * side > 0]
        reach = s.units(POCKET['reach'])
        sharp = []
        for x in bm.edges:
            if len(x.link_faces) != 2 or x.verts[0].co.x * side <= 0:
                continue
            if any(q[part] not in trunk for f in x.link_faces for q in f.verts):
                continue
            a, b = x.link_faces
            if math.degrees(a.normal.angle(b.normal, 0.0)) < POCKET['angle']:
                continue
            mid = (x.verts[0].co + x.verts[1].co) / 2
            if min((mid - q).length for q in lip) < reach:
                sharp.append(x)
        verts = {p for x in sharp for p in x.verts}
        verts |= {q for p in verts for x in p.link_edges for q in [x.other_vert(p)]}
        # The pocket where the forearm touched the belly: the vertices near the lowest point of the
        # trunk lip.
        low = min((p for p in bm.verts if p[part] == TRUNK_LIP and p.co.x * side > 0),
                  key=lambda p: p.co.z)
        verts |= {p for p in bm.verts if (p.co - low.co).length < s.units(POCKET['ball'])}
        verts = [p for p in verts if p[part] in trunk]
        start = {p: p.co.copy() for p in verts}
        for _ in range(POCKET['rounds']):
            for factor in (0.5, -0.53):
                bmesh.ops.smooth_vert(bm, verts=verts, factor=factor, use_axis_x=True,
                                      use_axis_y=True, use_axis_z=True)
        most = max(((p.co - start[p]).length for p in verts), default=0.0)
        out[side] = (len(sharp), round(most / s.fr.height, 4))
    bm.normal_update()
    bm.to_mesh(s.mesh.data)
    bm.free()
    return out


def seam_plane(bm, side):
    """Gives the plane of the side wall of one side (a point and the unit normal toward the arm):
    the plane through the armpit line and the lowest vertex of the trunk lip."""
    part = bm.verts.layers.int['edit_part']
    ends = [p for p in bm.verts if p[part] == APEX and p.co.x * side > 0]
    lip = [p for p in bm.verts if p[part] == TRUNK_LIP and p.co.x * side > 0]
    mid = (ends[0].co + ends[1].co) / 2
    low = min(lip, key=lambda p: p.co.z)
    normal = (ends[0].co - ends[1].co).cross(low.co - mid).normalized()
    if normal.x * side < 0:
        normal = -normal
    return mid, normal


def wall_loop(s, bm, side):
    """Gives the boundary loop of the trunk hole of one side in order: the trunk lip and the armpit
    line."""
    part = bm.verts.layers.int['edit_part']
    edges = open_edges(s, bm, side)
    links = {}
    for x in edges:
        a, b = x.verts
        links.setdefault(a, []).append(b)
        links.setdefault(b, []).append(a)
    if any(len(q) != 2 for q in links.values()):
        raise RuntimeError('The hole of the side %d touches itself.' % side)
    start = next(p for p in links if p[part] == APEX)
    loop, prev = [start], None
    for _ in range(len(links)):
        nxt = next(q for q in links[loop[-1]] if q is not prev)
        if nxt is start:
            if len(loop) != len(links):
                raise RuntimeError('The side %d has more than one hole.' % side)
            return loop
        prev = loop[-1]
        loop.append(nxt)
    raise RuntimeError('The hole of the side %d does not close.' % side)


def step_wall(s):
    """Closes the trunk of each side with a side wall, as `step_round_wall()` of `cat_arms.py`
    does for the cat:

    1. Fill: a 2D Delaunay triangulation (`delaunay_2d_cdt()` of Blender) of the hole outline (the
       trunk lip and the armpit line), projected on the plane of the seam (`seam_plane()`), and of
       the points of a grid of the side `WALL['grid']` units inside it (`cat_arms.wall_grid()`).
       The new vertices lie on the plane.
    2. Smooth along the normal of the plane only, `WALL['rounds']` times with the factor 0.5: the
       wall, its outline, and `WALL['rings']` rings of trunk vertices within `WALL['reach']` units
       of the wall move, and the armpit line stays. No vertex goes beyond the plane toward the arm,
       and a vertex of the wall goes at most `WALL['deep']` units into the trunk.
    3. Relax the inner vertices of the wall in all axes, `WALL['relax']` Taubin rounds of Smooth
       Vertices, with the outline fixed, so that the wall meets the trunk with no step.

    Gives for each side the counts of the new faces and of the moving vertices, and the largest
    move in units."""
    from mathutils.geometry import delaunay_2d_cdt
    from mathutils.kdtree import KDTree
    import numpy as np

    bm = bmesh.new()
    bm.from_mesh(s.mesh.data)
    bm.normal_update()
    part = bm.verts.layers.int['edit_part']
    fill = bm.faces.layers.int['edit_fill']
    out = {}
    for side in (1, -1):
        plane_co, plane_no = seam_plane(bm, side)
        plane_co = plane_co - plane_no * s.units(WALL['inset'])
        # The lips: trunk faces beside the hole that turn away from the arm, near the plane.
        lips = set()
        stack = [f for p in bm.verts if p[part] == TRUNK_LIP and p.co.x * side > 0
                 for f in p.link_faces]
        while stack:
            f = stack.pop()
            if (f in lips or f.normal.dot(plane_no) > WALL['lip']
                    or min((p.co - plane_co).dot(plane_no) for p in f.verts)
                    < -s.units(WALL['depth'])
                    or any(p[part] not in (TRUNK, TRUNK_LIP) for p in f.verts)):
                continue
            lips.add(f)
            stack += [g for x in f.edges for g in x.link_faces if g not in lips]
        for f in lips:
            for p in f.verts:
                p[part] = TRUNK_LIP
        bmesh.ops.delete(bm, geom=list(lips), context='FACES')
        loose = [p for p in bm.verts if not p.link_faces and p[part] == TRUNK_LIP]
        bmesh.ops.delete(bm, geom=loose, context='VERTS')
        loop = wall_loop(s, bm, side)
        up = plane_no.cross(Vector((0.0, -1.0, 0.0))).normalized()
        if up.z < 0:
            up = -up
        across = up.cross(plane_no).normalized()
        outline = [((p.co - plane_co).dot(across), (p.co - plane_co).dot(up)) for p in loop]
        points = ar.ca.wall_grid(outline, s.units(WALL['grid']))
        n = len(outline)
        coords, _, tris, origins, _, _ = delaunay_2d_cdt(
            [Vector(c) for c in outline + points], [(k, (k + 1) % n) for k in range(n)],
            [list(range(n))], 1, 1e-9)
        if any(len(origin) > 1 for origin in origins) or len(coords) != n + len(points):
            raise RuntimeError('The outline of the wall crosses itself in the plane of the seam.')
        verts = {}
        for k, origin in enumerate(origins):
            if origin and origin[0] < n:
                verts[k] = loop[origin[0]]
            else:
                p = bm.verts.new(plane_co + across * coords[k][0] + up * coords[k][1])
                p[part] = TRUNK_FILL
                verts[k] = p
        faces = []
        for tri in tris:
            f = bm.faces.new([verts[k] for k in tri])
            f[fill] = TRUNK_FILL
            f.smooth = True
            faces.append(f)
        orient(bm, faces)
        moving = {p for f in faces for p in f.verts if p[part] in (TRUNK_FILL, TRUNK_LIP)}
        tree = KDTree(len(moving))
        for k, p in enumerate(moving):
            tree.insert(p.co, k)
        tree.balance()
        ring = set(moving)
        for _ in range(WALL['rings']):
            ring = {q for p in ring for x in p.link_edges for q in [x.other_vert(p)]
                    if q[part] == TRUNK and q not in moving
                    and tree.find(q.co)[2] < s.units(WALL['reach'])}
            moving |= ring
        moving = sorted(moving, key=lambda p: p.index)
        normal = np.array(plane_no[:])
        start = np.array([p.co[:] for p in moving])
        depth = (start - np.array(plane_co[:])) @ normal
        wall = np.array([p[part] == TRUNK_FILL for p in moving])
        lift = np.zeros(len(moving))
        for _ in range(WALL['rounds']):
            for p, co in zip(moving, start + np.outer(lift, normal)):
                p.co = Vector(co)
            mean = np.array([sum((x.other_vert(p).co for x in p.link_edges), Vector())
                             / len(p.link_edges) for p in moving])
            lift += 0.5 * ((mean - start) @ normal - lift)
            lift = np.where(wall, np.maximum(lift, -s.units(WALL['deep']) - depth), lift)
            lift = np.where(wall, np.minimum(lift, -depth), lift)
        for p, co in zip(moving, start + np.outer(lift, normal)):
            p.co = Vector(co)
        # 3. Relax the wall in all axes with Taubin rounds, with its outline fixed, so that the
        # wall meets the trunk at its outline with no step.
        inner = [p for p in moving if p[part] == TRUNK_FILL]
        for _ in range(WALL['relax']):
            for factor in (0.5, -0.53):
                bmesh.ops.smooth_vert(bm, verts=inner, factor=factor, use_axis_x=True,
                                      use_axis_y=True, use_axis_z=True)
        out[side] = (len(lips), len(faces), len(moving),
                     round(float(np.abs(lift).max() / s.fr.height), 4))
    bm.normal_update()
    bm.to_mesh(s.mesh.data)
    bm.free()
    return out


#: The steps of the edit, in order.
STEPS = (step_rip, step_turn, step_fill, step_wall, step_pocket, step_fair, step_round,
         step_color)


def main():
    """Runs the steps on the source mesh, writes the copy, and prints the joints of the left arm
    for the rig config, for arms `--factor` times longer (1 by default)."""
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    factor = 1.0
    if '--factor' in argv:
        k = argv.index('--factor')
        factor = float(argv[k + 1])
        argv = argv[:k] + argv[k + 2:]
    if len(argv) != 1:
        raise SystemExit('Usage: blender -b --factory-startup -P tools/blender/beaver_edit.py -- '
                         '<out.glb> [--factor <f>]')
    if sys.flags.hash_randomization:
        # A fixed string hash gives the same order of each set and dict on each run.
        env = dict(os.environ, PYTHONHASHSEED='0')
        code = subprocess.call([bpy.app.binary_path, '-b', '--factory-startup',
                                '--python-use-system-env', '--python', os.path.abspath(__file__),
                                '--', *sys.argv[sys.argv.index('--') + 1:]], env=env)
        raise SystemExit(code)
    va.clear_scene()
    s = session()
    va.import_mesh(s)
    for step in STEPS:
        print('beaver_edit: %s: %s' % (step.__name__, step(s)))
    print('beaver_edit: wrote %s, %d bytes' % (argv[0], step_export(s, os.path.abspath(argv[0]))))
    joints = turned_joints(s.joints, factor)
    print('beaver_edit: joints %s' % json.dumps({'%s.%s' % k: v for k, v in joints.items()}))


if __name__ == '__main__':
    main()
