"""Frees the arms of a copy of the panda mesh from the trunk (a trial, design 4.4).

The upper arm of `panda.glb` joins the side of the trunk from the shoulder down to the elbow, so
`arm_rebuild.py` finds no free section of the upper arm. This script frees each arm in a copy, so
that `arm_rebuild.py` can rebuild it as the arm of any body:

1. Import the source and Merge by Distance (`violin_arms.import_mesh()`).
2. Split the edges of the crease where the arm meets the trunk (`SEAMS`, `step_rip()`).
3. Turn the arm out about the forward axis through the shoulder joint, and shift it out and up,
   with a ramp along the upper arm (`step_turn()`). The two copies of a seam vertex that part by
   less than `JOIN` join again, so that the hole starts where it opens.
4. Close the hole of each side: an armpit line from the front to the back end of the hole, and a
   grid of quads on the lip of the arm and on the lip of the trunk (`step_fill()`).
5. Smooth the old crease on both lips (`step_fair()`).
6. Give each new face the fur color of the nearest old face of its part (`step_color()`).
7. Write the copy (`step_export()`).

`turned_joints()` gives the joints of the left arm for the rig config after the turn.

The trial does not give a clean copy yet. `pnpm mesh-intake` passes the pose, the arm free, and the
gap lines, but the four-side images show slivers at the armpits and a notch at the inner elbow,
and the rebuilt arm shows shards on the side wall where the forearm touched the belly
(`TODO.md`). No body reads the copy.

Run it in a terminal from the root of the tree:

    blender -b --factory-startup -P tools/blender/panda_edit.py -- <out.glb>

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
#: of the back crease, down to the elbow, and up the front crease. Vertex indices of the welded
#: source (`violin_arms.import_mesh()`).
SEAMS = {
    1: [535, 536, 538, 471, 473, 796, 798, 791, 790, 788, 460, 459, 457, 456, 453, 432, 433, 431],
    -1: [597, 601, 636, 639, 637, 638, 1301, 1300, 1289, 1286, 1290, 589, 590, 586, 546, 545, 543],
}

#: The turn of each arm out from the trunk, in degrees, about the forward axis through the
#: shoulder joint.
TURN = 10.0

#: The shift of each arm out and up, at a right angle to the turned upper arm, in units.
SHIFT = 0.012

#: The shares of the upper arm over which the turn grows from 0 to its full angle.
RAMP = (0.05, 0.45)

#: The arm of the turn: the vertices from this share of the upper arm on, on the arm side of the
#: seam (`arm_region()`).
FLOOD = 0.0

#: The two copies of a seam vertex that part by less than this distance in units join again.
JOIN = 0.005

#: The smooth of the old crease (`step_fair()`): the rings of old trunk faces beside the lip, and
#: the rounds and the factor of Smooth Vertices.
FAIR_BAND = 1
FAIR_SMOOTH = 4
FAIR_FACTOR = (0.5,)

#: The codes of the vertex attribute `panda_part`: the trunk, the turned arm, the armpit line,
#: the new faces of the arm, the new faces of the trunk, the lip of the arm, and the lip of the
#: trunk.
TRUNK, ARM, PIT, ARM_FILL, TRUNK_FILL, ARM_LIP, TRUNK_LIP = 0, 1, 2, 3, 4, 5, 6


def session():
    """Gives a session of `arm_rebuild.py` on the source mesh of the panda."""
    return ar.Session('panda', source='assets/models/panda/panda.glb')


def share(s, side, co):
    """Gives the share of the upper arm of a point: its projection on the bone from the shoulder
    joint, over the length of the bone."""
    a, e, _, _ = va.arm_line(s, side)
    return (co - a).dot((e - a).normalized()) / (e - a).length


def step_rip(s):
    """Splits the edges of each seam, so that the arm and the trunk part along the seam."""
    bm = bmesh.new()
    bm.from_mesh(s.mesh.data)
    bm.verts.ensure_lookup_table()
    out, seams = {}, {}
    for side, chain in SEAMS.items():
        verts = [bm.verts[i] for i in chain]
        edges = [bm.edges.get((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
        if any(edge is None for edge in edges):
            raise RuntimeError('The seam of the side %d is no edge chain.' % side)
        seams[side] = edges
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


def step_turn(s):
    """Turns each arm out about the forward axis through its shoulder joint by `TURN`, and shifts
    it by `SHIFT`, each times the ramp of `RAMP` along the upper arm. Joins the copies of the seam
    vertices that part by less than `JOIN`. Gives the vertices of each arm and the counts."""
    bm = bmesh.new()
    bm.from_mesh(s.mesh.data)
    part = bm.verts.layers.int.get('panda_part') or bm.verts.layers.int.new('panda_part')
    out = {}
    seam = [p for p in bm.verts if p.is_boundary]
    # The two copies of each split seam vertex lie at one point before the turn.
    twins = {}
    for p in seam:
        for q in seam:
            if q is not p and (q.co - p.co).length < 1e-9:
                twins[p] = q
    for side in (1, -1):
        a, e, _, _ = va.arm_line(s, side)
        full = Matrix.Rotation(math.radians(-side * TURN), 3, Vector((0, 1, 0)))
        u = full @ (e - a).normalized()
        # The shift goes out and up, at a right angle to the turned upper arm in the front view.
        lift = Vector((-u.z, 0.0, u.x)).normalized() * side * SHIFT * s.fr.height
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


def hole(bm, side):
    """Gives the boundary loop of the open seam of one side, in order."""
    adj = {}
    for edge in bm.edges:
        if edge.is_boundary and edge.verts[0].co.x * side > 0:
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


def lips(bm, side):
    """Splits the hole of one side into the lip of the arm and the lip of the trunk. Gives the
    front and the back apex (the vertices where the two lips meet), the arm lip from the front
    apex to the back apex, and the trunk lip from the back apex to the front apex."""
    part = bm.verts.layers.int['panda_part']
    loop = hole(bm, side)
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
    part = bm.verts.layers.int['panda_part']
    fill = bm.faces.layers.int.get('panda_fill') or bm.faces.layers.int.new('panda_fill')
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
    """Closes the arm and the trunk of each side: an armpit line from the front apex to the back
    apex, and a grid patch of quads on each lip (`grid_patch()`)."""
    bm = bmesh.new()
    bm.from_mesh(s.mesh.data)
    part = bm.verts.layers.int['panda_part']
    out = {}
    for side in (1, -1):
        front, back, arm, trunk = lips(bm, side)
        trunk = trunk[::-1]
        p = pit_count(arm, trunk, front, back)
        pit = [front]
        for i in range(1, p):
            v = bm.verts.new(front.co.lerp(back.co, i / p))
            v[part] = PIT
            pit.append(v)
        pit.append(back)
        made = {}
        for lip, code in ((arm, ARM_FILL), (trunk, TRUNK_FILL)):
            for v in lip[1:-1]:
                v[part] = ARM_LIP if code == ARM_FILL else TRUNK_LIP
            n = len(lip) - 1
            k = (n - p) // 2
            made[code] = grid_patch(bm, pit, lip[:k + 1], lip[::-1][:k + 1], lip[k:k + p + 1],
                                    code)
            orient(bm, made[code][1])
        out[side] = {'pit': p, 'arm': len(made[ARM_FILL][1]), 'trunk': len(made[TRUNK_FILL][1])}
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
    """Gives each new face one fur color: each corner takes the UV middle of the nearest old face
    of its part (the arm for the faces of the arm, the trunk for the faces of the trunk). Each
    face of the rig takes one color, so the new faces continue the fur beside them."""
    bm = bmesh.new()
    bm.from_mesh(s.mesh.data)
    part = bm.verts.layers.int['panda_part']
    fill = bm.faces.layers.int['panda_fill']
    uv = bm.loops.layers.uv.active
    fills = {ARM_FILL: ARM, TRUNK_FILL: TRUNK}
    old = {ARM: [], TRUNK: []}
    new = []
    for f in bm.faces:
        if f[fill]:
            new.append((f, f[fill]))
        elif all(p[part] in (ARM, ARM_LIP) for p in f.verts):
            old[ARM].append(f)
        else:
            old[TRUNK].append(f)
    middles = {
        key: [(f.calc_center_median(),
               sum((lp[uv].uv for lp in f.loops), Vector((0, 0))) / len(f.loops))
              for f in faces]
        for key, faces in old.items()
    }
    for f, c in new:
        center = f.calc_center_median()
        _, at = min(middles[fills[c]], key=lambda m: (m[0] - center).length)
        for lp in f.loops:
            lp[uv].uv = at
    bm.to_mesh(s.mesh.data)
    bm.free()
    return len(new)


def rings_of(verts, count):
    """Gives the vertices within `count` edge steps of a set of vertices, without the set."""
    seen, edge = set(verts), set(verts)
    for _ in range(count):
        edge = {q for p in edge for q in (e.other_vert(p) for e in p.link_edges)} - seen
        seen |= edge
    return seen - set(verts)


def step_fair(s):
    """Smooths the old crease on each side with Smooth Vertices (`FAIR_SMOOTH` rounds of each
    factor of `FAIR_FACTOR`). On the trunk, the new faces, the lip, and `FAIR_BAND` rings of old
    faces beside the lip move. On the arm, the new faces and the lip move. The armpit line stays.
    Gives the largest move of each side in units."""
    bm = bmesh.new()
    bm.from_mesh(s.mesh.data)
    part = bm.verts.layers.int['panda_part']
    start = {p: p.co.copy() for p in bm.verts}
    out = {}
    for side in (1, -1):

        def mine(code):
            return {p for p in bm.verts if p[part] == code and p.co.x * side > 0}

        lip = mine(TRUNK_LIP)
        trunk = lip | mine(TRUNK_FILL)
        trunk |= {p for p in rings_of(lip, FAIR_BAND) if p[part] == TRUNK}
        for verts in (trunk, mine(ARM_FILL) | mine(ARM_LIP)):
            for _ in range(FAIR_SMOOTH):
                # A Taubin step: a smooth, then a smaller step back out, so that the form does not
                # shrink.
                for factor in FAIR_FACTOR:
                    bmesh.ops.smooth_vert(bm, verts=list(verts), factor=factor, use_axis_x=True,
                                          use_axis_y=True, use_axis_z=True)
        moved = [(p.co - start[p]).length for p in bm.verts if p.co.x * side > 0]
        out[side] = round(max(moved) / s.fr.height, 4)
    bm.normal_update()
    bm.to_mesh(s.mesh.data)
    bm.free()
    return out


#: The steps of the edit, in order.
STEPS = (step_rip, step_turn, step_fill, step_fair, step_color)


def main():
    """Runs the steps on the source mesh, writes the copy, and prints the joints of the left arm
    for the rig config (with the arm factor of the config)."""
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if len(argv) != 1:
        raise SystemExit('Usage: blender -b --factory-startup -P tools/blender/panda_edit.py -- '
                         '<out.glb>')
    if sys.flags.hash_randomization:
        # A fixed string hash gives the same order of each set and dict on each run.
        env = dict(os.environ, PYTHONHASHSEED='0')
        code = subprocess.call([bpy.app.binary_path, '-b', '--factory-startup',
                                '--python-use-system-env', '--python', os.path.abspath(__file__),
                                '--', *argv], env=env)
        raise SystemExit(code)
    va.clear_scene()
    s = session()
    va.import_mesh(s)
    for step in STEPS:
        print('panda_edit: %s: %s' % (step.__name__, step(s)))
    print('panda_edit: wrote %s, %d bytes' % (argv[0], step_export(s, os.path.abspath(argv[0]))))
    joints = turned_joints(s.config['joints'], s.config['armFactor'])
    print('panda_edit: joints %s' % json.dumps({'%s.%s' % k: v for k, v in joints.items()}))


if __name__ == '__main__':
    main()
