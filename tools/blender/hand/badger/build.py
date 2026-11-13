"""Builds the hand rig of the Tripo badger in headless Blender, from the FBX of the source, with the
point edits, the rings, the surface, the rig, and the exact weight rows of params.json.

    blender -b --factory-startup --python tools/blender/hand/badger/build.py -- --out <file.blend>

Each step is a scripted point edit on chosen vertices. assets/models/badger/README.md gives each
call and value.
"""

import json
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
OUT = os.path.join(ROOT, 'scratch', 'hand', os.path.basename(HERE))
os.makedirs(OUT, exist_ok=True)
sys.path.insert(0, os.path.join(ROOT, 'tools', 'blender'))
sys.path.insert(0, HERE)
import redits as ce  # noqa: E402
import rimport  # noqa: E402
import rings  # noqa: E402
import tail as tl  # noqa: E402
import studio_armature as sa  # noqa: E402

import make_config as mc  # noqa: E402

P = mc.P
CONFIG = json.load(open(os.path.join(ROOT, 'tools/mesh-rigs/simple/badger-tripo.json')))
LOG = []


def log(*a):
    text = ' '.join(str(x) for x in a)
    LOG.append(text)
    print('build:', text, flush=True)


def studio_points(me):
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    return co.reshape(-1, 3) @ sa.TO_STUDIO.T


def set_studio_points(me, S):
    me.vertices.foreach_set('co', (S @ sa.TO_STUDIO).ravel())
    me.update()


def point_edits(body):
    me = body.data
    S = studio_points(me)
    # The tail of the badger is a part of the body: its points lie behind the haunch.
    tail = tail_mask(S)
    roots = part_roots(me)
    count = np.bincount(roots)
    part = np.where(count[roots] < 100, roots, -1)
    # The edits marked `after` run later in the build (paw_size()), after the automatic weights.
    T = ce.map_points(
        S, dict(P, edits=[e for e in P.get('edits', []) if 'after' not in e]), tail, part
    )
    set_studio_points(me, T)
    log(
        'point edits',
        [e['kind'] for e in P.get('edits', [])],
        'largest move',
        round(float(np.linalg.norm(T - S, axis=1).max()), 4),
    )
    move = np.linalg.norm(T - S, axis=1)
    eyeball = (part >= 0) & (count[roots] > 80)
    log(
        'point edits: moved',
        int((move > 1e-6).sum()),
        'points;',
        int(((move > 1e-6) & (part >= 0) & ~eyeball).sum()),
        'loose non-ball points; largest skin move',
        round(float(move[part < 0].max()), 4) if len(move) else 0,
        '; largest move below y 0.75',
        round(float(move[(S[:, 1] < 0.75) & ~eyeball].max()), 4),
    )


def paw_size(body):
    """Scales the front paws with the edit `paw` of redits.py (the edits of params.json with
    `after`). The step comes after the automatic weights and before the exact rows, so the
    automatic weights stay those of the mesh with the paws of the source, and the wrist and
    knuckle rows take the edited paw and the knuckle joint of the config (moved by the same edit)."""
    edits = [e for e in P.get('edits', []) if 'after' in e]
    if not edits:
        return
    me = body.data
    S = studio_points(me)
    T = ce.map_points(S, dict(P, edits=edits))
    set_studio_points(me, T)
    move = np.linalg.norm(T - S, axis=1)
    for sign, side in ((1, 'L'), (-1, 'R')):
        moved = (move > 1e-6) & (sign * S[:, 0] > 0)
        log(
            f'paw size {side}: {int(moved.sum())} vertices move, largest {move[moved].max():.4f}, '
            f'lowest moved |x| {np.abs(S[moved, 0]).min():.4f}, tip |x| {np.abs(S[:, 0]).max():.4f} -> {np.abs(T[:, 0]).max():.4f}'
        )


def limb_loops(bm, kind, sign):
    P_ = np.array([rings.studio(v.co) for v in bm.verts])
    if kind == 'arm':
        inside = (sign * P_[:, 0] > 0.07) & (P_[:, 1] > 0.50) & (P_[:, 1] < 0.70)
        axis = (sign, 0, 0)
    else:
        me = bpy.data.meshes.new('tmp')
        bm.to_mesh(me)
        tail = np.zeros(len(P_), bool)
        tail[tail_vertices(me)] = True
        bpy.data.meshes.remove(me)
        inside = (sign * P_[:, 0] > 0.0) & (P_[:, 1] < 0.45) & (P_[:, 2] > 0.0) & ~tail
        axis = (0, 1, 0)
    out, _ = rings.loops_around(bm, inside, axis)
    return [(abs(a), v) for a, v, closed, _ in out if closed]


def subdivide(body):
    """Edge ring Subdivide of the clean quad bands of params rings: arms by x, legs by y. A band
    is the band between two closed loops, at the given places (each within 0.004)."""
    me = body.data
    for kind in ('arm', 'leg'):
        for sign in (1.0, -1.0):
            for a, b, cuts in P['rings'][kind]:
                bm = bmesh.new()
                bm.from_mesh(me)
                loops = limb_loops(bm, kind, sign)
                la = min(loops, key=lambda r: abs(r[0] - a))
                lb = min(loops, key=lambda r: abs(r[0] - b))
                if abs(la[0] - a) > 0.004 or abs(lb[0] - b) > 0.004:
                    raise SystemExit(
                        f'No loops at {a}, {b} of the {kind} ({sign}): {la[0]}, {lb[0]}'
                    )
                ring = rings.band_ring(bm, la[1], lb[1])
                if ring is None:
                    raise SystemExit(f'The band {a} to {b} of the {kind} is no clean quad ring.')
                bmesh.ops.subdivide_edges(bm, edges=ring, cuts=cuts, use_grid_fill=True)
                bm.to_mesh(me)
                bm.free()
                log(
                    f'{kind} {"L" if sign > 0 else "R"}: band {a} to {b}, {len(ring)} edges, {cuts} cuts'
                )
    me.update()


def turn_paws(body):
    """Turns each paw rigidly about the rest forearm axis by whole ring steps (pawTurn of the
    params, 45 degrees for the rings of 8 edges): each vertex past the wrist ring at x `turnRing`
    turns, the 8 quads of the band from the ring before it go, and new quads join the two rings
    with the same step offset, with the UVs of the old quads."""
    me = body.data
    for side, sign in (('L', 1.0), ('R', -1.0)):
        k = P.get('pawTurn', {}).get(side, 0)
        if not k:
            continue
        angle = ce.paw_turn_angle(P, side)
        f, axis = ce.paw_axis(P['sourceJoints'], side)
        R = ce.rotation(axis, angle)
        bm = bmesh.new()
        bm.from_mesh(me)
        uv = bm.loops.layers.uv.active
        loops = limb_loops(bm, 'arm', sign)
        a_pos, b_pos = P['turnRings']
        la = min(loops, key=lambda r: abs(r[0] - a_pos))
        lb = min(loops, key=lambda r: abs(r[0] - b_pos))
        assert abs(la[0] - a_pos) < 0.003 and abs(lb[0] - b_pos) < 0.003, (la[0], lb[0])
        bm.verts.ensure_lookup_table()
        A = la[1]
        sb = set(lb[1])
        B = []
        for i in A:
            v = bm.verts[i]
            B.append(
                next(e.other_vert(v).index for e in v.link_edges if e.other_vert(v).index in sb)
            )
        n = len(A)
        old = []
        for i in range(n):
            quad = [
                bm.verts[A[i]],
                bm.verts[A[(i + 1) % n]],
                bm.verts[B[(i + 1) % n]],
                bm.verts[B[i]],
            ]
            face = next(fc for fc in quad[0].link_faces if set(fc.verts) == set(quad))
            order = [v.index for v in face.verts]
            forward = order[(order.index(A[i]) + 1) % 4] == A[(i + 1) % n]
            uvs = {l.vert.index: tuple(l[uv].uv) for l in face.loops}
            old.append((forward, [uvs[q.index] for q in quad]))
            bm.faces.remove(face)
        # The paw: each arm vertex past ring A along the axis, on the side of the paw.
        S = np.array([rings.studio(v.co) for v in bm.verts])
        Borig = S[B].copy()
        t_a = float(np.mean((S[A] - f) @ axis))
        r = np.linalg.norm((S - f) - np.outer((S - f) @ axis, axis), axis=1)
        move = (((S - f) @ axis) > t_a + 0.002) & (r < 0.08) & (sign * S[:, 0] > 0.15)
        S[move] = (S[move] - f) @ R.T + f
        for i in np.nonzero(move)[0]:
            bm.verts[i].co = Vector((S[i] @ sa.TO_STUDIO).tolist())
        # The new quads join A[i] to the turned vertex that now lies where B[i] lay before.
        Bold = np.array([R.T @ (S[b] - f) + f for b in B])
        shift = min(
            range(n),
            key=lambda s_: sum(np.linalg.norm(S[B[(i + s_) % n]] - Bold[i]) for i in range(n)),
        )
        fade = P.get('turnFit')
        if fade:
            # The turned ring B takes the form of the ring before the turn: each vertex B[i + shift]
            # moves to the old place of B[i], and the move fades along the paw to 0 at `fade`
            # units past the ring, so that the join has no step. Each moved vertex takes the move
            # of the ring vertex nearest to it by its angle about the axis.
            delta = np.array([Borig[i] - S[B[(i + shift) % n]] for i in range(n)])
            ring = np.array([S[B[(i + shift) % n]] for i in range(n)])
            t_b = float(np.mean((ring - f) @ axis))

            def angle_of(p):
                v = (p - f) - np.outer((p - f) @ axis, axis)
                e1 = np.cross(axis, [0.0, 1.0, 0.0])
                e1 /= np.linalg.norm(e1)
                e2 = np.cross(axis, e1)
                return np.arctan2(v @ e2, v @ e1)

            ring_ang = angle_of(ring)
            ids = np.nonzero(move)[0]
            ang = angle_of(S[ids])
            diff = np.abs((ang[:, None] - ring_ang[None, :] + np.pi) % (2 * np.pi) - np.pi)
            near = diff.argmin(axis=1)
            w = 1 - ce.smoothstep(0.0, fade, (S[ids] - f) @ axis - t_b)
            S[ids] += w[:, None] * delta[near]
            for i in ids:
                bm.verts[i].co = Vector((S[i] @ sa.TO_STUDIO).tolist())
        band = bm.faces.layers.int.get('band') or bm.faces.layers.int.new('band')
        for i in range(n):
            forward, uvs = old[i]
            quad = [
                bm.verts[A[i]],
                bm.verts[A[(i + 1) % n]],
                bm.verts[B[(i + 1 + shift) % n]],
                bm.verts[B[(i + shift) % n]],
            ]
            vs, uv_list = (quad, uvs) if forward else (quad[::-1], uvs[::-1])
            face = bm.faces.new(vs)
            face[band] = 1 if side == 'L' else 2
            face.smooth = False
            for l, u in zip(face.loops, uv_list):
                l[uv].uv = u
        gap = max(np.linalg.norm(S[B[(i + shift) % n]] - Bold[i]) for i in range(n))
        bm.normal_update()
        bm.to_mesh(me)
        bm.free()
        log(
            f'paw {side}: turn {np.degrees(angle):.1f} deg ({k} steps), {int(move.sum())} vertices, '
            f'ring offset {shift}, largest gap of a turned ring vertex from its old place {gap:.4f}'
        )
    me.update()


def build_rig(rm):
    """build_armature() of studio_armature.py with a palm for each side: the palm of the config
    turned by the paw turn of the side about its rest forearm axis. With hingeTurn of the params,
    the elbow axis of a side turns about its bind upper arm by that angle in degrees."""
    config = CONFIG
    bones = rm['BONES']
    rm['BONES'] = tuple(b for b in bones if b not in rm['SEGMENT_PARENTS'])
    heads, ends, rolls, children = rm['joints_of'](config)
    rm['BONES'] = bones
    rm['segment_joints'](heads, ends, rolls, children, config['armSegments'])
    palms = {}
    for side in 'LR':
        m = np.array([1.0 if side == 'L' else -1.0, 1, 1])
        palm = np.array(config['palm'], float) * m
        palm /= np.linalg.norm(palm)
        f, axis = ce.paw_axis(config['joints'], side)
        palms[side] = ce.rotation(axis, ce.paw_turn_angle(P, side)) @ palm
    for name in rolls:
        stem = name[:-2].split('_seg')[0] if name[-2:] in ('_L', '_R') else name
        if stem in sa.PALM_STEMS:
            rolls[name] = palms[name[-1]]
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
        bone.use_deform = bone.name not in sa.DRIVERS
        rig.pose.bones[bone.name].rotation_quaternion = (1, 0, 0, 0)
        rig.pose.bones[bone.name].rotation_mode = 'QUATERNION'
    rig['palm'] = {side: [round(float(x), 6) for x in to_blender(p)] for side, p in palms.items()}
    trunk = rm['trunk_turn'](config, heads, ends, rolls)
    turns = rm['bind_turns'](config, heads, ends, rolls, trunk)
    posed = rm['posed_heads'](heads, turns)
    hip, knee = posed['thigh_L'], posed['shin_L']
    seat = {k: float(config['chair'][k]) for k in ('front', 'back', 'halfWidth')}
    if 'seatGap' in P:
        seat['front'] = round(float(knee[2] - P['seatGap']), 4)
    share = (seat['front'] - hip[2]) / (knee[2] - hip[2])
    rig['seat'] = {'prop': config['chair'].get('prop', 'chair'), **seat}
    log(
        f'seat: bind hip z {hip[2]:.4f}, knee z {knee[2]:.4f}, front {seat["front"]}, back '
        f'{seat["back"]}: {100 * share:.0f} % of the thigh over the seat, front edge '
        f'{knee[2] - seat["front"]:.4f} units behind the knee; tail root {np.round(posed["tail"], 3).tolist()}'
    )
    hinges = rm['bind_hinges'](config, turns, heads, ends)
    for side, deg in P.get('hingeTurn', {}).items():
        up = turns[f'upper_arm_{side}'] @ rm['unit'](
            heads[f'forearm_{side}'] - heads[f'upper_arm_{side}']
        )
        hinges[side] = ce.rotation(up, np.radians(deg)) @ np.asarray(hinges[side], float)
    rig['hinges'] = {
        side: [round(float(x), 6) for x in to_blender(axis)] for side, axis in hinges.items()
    }
    action = bpy.data.actions.new('bind')
    action.use_fake_user = True
    rig.animation_data_create().action = action
    sa.set_world_turns(rig, turns, sa.pose_worlds(rig), key_frame=1)
    log('rig: palms', rig['palm'].to_dict(), 'hinges', rig['hinges'].to_dict())
    return rig


def fold_faces(S, tris, rule):
    """The triangles of the body with a corner whose app normal (crease 180: the angle-weighted
    mean of the normals of all triangles at its vertex) turns more than rule.angle degrees from
    the normal of the triangle, in the region of the rule: no paw (|x| below rule.pawX) and no foot
    (y above rule.footY)."""
    Pt = S[tris]
    n = np.cross(Pt[:, 1] - Pt[:, 0], Pt[:, 2] - Pt[:, 0])
    n /= np.maximum(np.linalg.norm(n, axis=1), 1e-12)[:, None]
    acc = np.zeros_like(S)
    for k in range(3):
        u = Pt[:, (k + 1) % 3] - Pt[:, k]
        v = Pt[:, (k + 2) % 3] - Pt[:, k]
        c = (u * v).sum(1) / np.maximum(
            np.linalg.norm(u, axis=1) * np.linalg.norm(v, axis=1), 1e-12
        )
        np.add.at(acc, tris[:, k], n * np.arccos(np.clip(c, -1, 1))[:, None])
    acc /= np.maximum(np.linalg.norm(acc, axis=1), 1e-12)[:, None]
    dots = np.stack([(acc[tris[:, k]] * n).sum(1) for k in range(3)], 1)
    mid = Pt.mean(1)
    inside = (np.abs(mid[:, 0]) < rule['pawX']) & (mid[:, 1] > rule['footY'])
    return np.nonzero((dots.min(1) < np.cos(np.radians(rule['angle']))) & inside)[0]


def fold_relax(body):
    """The folds of the source surface: the FBX viewer shades them with the custom normals of the
    file, but the app makes its normals from the form, so the faces of a small fold shade dark. Each
    round moves each vertex of the fold triangles (fold_faces()) by `lam` times the mean of its edge
    neighbors less its place, until no fold triangle is left or after `rounds` rounds, with the
    total move of each vertex clipped to `clip` units. The loose parts stay."""
    rule = P.get('foldRelax')
    if not rule:
        return
    me = body.data
    me.calc_loop_triangles()
    loose = set(loose_vertices(me))
    tris = np.array([t.vertices[:] for t in me.loop_triangles if t.vertices[0] not in loose])
    S0 = studio_points(me)
    S = S0.copy()
    nbr = [[] for _ in range(len(S))]
    for e in me.edges:
        a, b = e.vertices
        nbr[a].append(b)
        nbr[b].append(a)
    first = len(fold_faces(S, tris, rule))
    moved = set()
    for k in range(rule['rounds']):
        bad = fold_faces(S, tris, rule)
        if not len(bad):
            break
        ids = sorted(set(tris[bad].ravel().tolist()) - loose)
        moved |= set(ids)
        mean = np.array([S[nbr[i]].mean(0) for i in ids])
        S[ids] += rule['lam'] * (mean - S[ids])
        d = S - S0
        n = np.linalg.norm(d, axis=1)
        over = n > rule['clip']
        S[over] = S0[over] + d[over] * (rule['clip'] / n[over])[:, None]
    left = fold_faces(S, tris, rule)
    set_studio_points(me, S)
    n = np.linalg.norm(S - S0, axis=1)
    log(
        f'fold relax: {first} fold triangles before, {len(left)} after {k + 1} rounds; {len(moved)} vertices move, '
        f'largest {n.max():.4f}, mean {n[list(moved)].mean() if moved else 0:.4f}; left at '
        f'{np.round(S[tris[left]].mean(1), 3).tolist()}'
    )


def own_eyes(body):
    """Gives the faces of the two eyeballs (the loose parts in the eye box) the face attribute
    `eye` and the eye color of the app."""
    me = body.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    part = {}
    for v in bm.verts:
        if v.index in part:
            continue
        stack, comp = [v], []
        part[v.index] = len(comp)
        while stack:
            u = stack.pop()
            comp.append(u.index)
            for e in u.link_edges:
                w = e.other_vert(u)
                if w.index not in part:
                    part[w.index] = 0
                    stack.append(w)
        for i in comp:
            part[i] = comp[0]
    bm.free()
    S = studio_points(me)
    lo, hi = np.array(CONFIG['colors']['eyeBox'][0]), np.array(CONFIG['colors']['eyeBox'][1])
    roots = {}
    for i, r in part.items():
        roots.setdefault(r, []).append(i)
    eyes = set()
    for r, ids in roots.items():
        q = S[ids]
        q = q * [np.sign(q[:, 0].mean()) or 1, 1, 1]
        n_lo, n_hi = P.get('eyeVerts', [80, 100])
        if (
            n_lo < len(ids) < n_hi
            and np.all(q.min(0) > lo - 0.005)
            and np.all(q.max(0) < hi + 0.005)
        ):
            eyes |= set(ids)
    faces = [p.index for p in me.polygons if all(v in eyes for v in p.vertices)]
    fused, fused_faces = fused_ball(body, sorted(eyes))
    eyes |= fused
    faces = sorted(set(faces) | fused_faces)
    attr = me.attributes.get('eye') or me.attributes.new('eye', 'BOOLEAN', 'FACE')
    flags = np.zeros(len(me.polygons), bool)
    flags[faces] = True
    attr.data.foreach_set('value', flags)
    rgb = np.array([0x15, 0x11, 0x0E]) / 255
    lin = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    for name in ('color', 'color_base'):
        data = me.attributes[name].data
        for f in faces:
            data[f].color = (*lin, 1.0)
    log('own eyes:', len(faces), 'faces,', len(eyes), 'vertices')
    return sorted(eyes)


def sphere_fit(q):
    """The middle and the radius of the least-squares sphere through the points q."""
    fit = np.linalg.lstsq(np.c_[2 * q, np.ones(len(q))], (q**2).sum(1), rcond=None)[0]
    return fit[:3], float(np.sqrt(fit[3] + fit[:3] @ fit[:3]))


def fused_ball(body, balls):
    """The eyeball of the side with no loose ball (fusedBall of the params): the source joins this
    ball to the rim of its socket, so it is a part of the head. The sphere of the loose ball of the
    other side, mirrored in x, is the first guess. Each round fits a sphere to the head vertices
    within `band` units of the sphere of the last round. The ball faces are the faces that a flood
    from the pole of the ball (the vertex of the most edges within the sphere) reaches through
    faces with each corner within `reach` radii of the middle. Gives the vertex set and the face
    set of the ball."""
    rule = P.get('fusedBall')
    if not rule or not balls:
        return set(), set()
    me = body.data
    S = studio_points(me)
    c, r = sphere_fit(S[balls])
    c = c * [-1.0, 1.0, 1.0]
    head = np.setdiff1d(np.arange(len(S)), loose_vertices(me))
    for _ in range(rule.get('rounds', 4)):
        d = np.abs(np.linalg.norm(S[head] - c, axis=1) - r)
        c, r = sphere_fit(S[head[d < rule['band']]])
    edges = np.empty(len(me.edges) * 2, int)
    me.edges.foreach_get('vertices', edges)
    valence = np.bincount(edges, minlength=len(S))
    inside = head[np.linalg.norm(S[head] - c, axis=1) < rule['reach'] * r]
    pole = int(inside[valence[inside].argmax()])
    ok = np.linalg.norm(S - c, axis=1) < rule['reach'] * r
    vert_faces = {}
    for p in me.polygons:
        for v in p.vertices:
            vert_faces.setdefault(v, []).append(p.index)
    faces, stack = set(), [pole]
    seen = {pole}
    while stack:
        v = stack.pop()
        for f in vert_faces.get(v, []):
            vs = me.polygons[f].vertices
            if f in faces or not all(ok[u] for u in vs):
                continue
            faces.add(f)
            for u in vs:
                if u not in seen:
                    seen.add(u)
                    stack.append(u)
    verts = {v for f in faces for v in me.polygons[f].vertices}
    log(
        f'fused ball: middle {np.round(c, 4).tolist()}, radius {r:.4f}, pole {pole} with '
        f'{int(valence[pole])} edges, {len(faces)} faces, {len(verts)} vertices'
    )
    return verts, faces


def round_balls(body, eyes):
    """Pulls the hidden back of each eyeball onto the sphere of the ball: each ball vertex more
    than ballRound degrees from the eye axis (the studio direction (0.35, 0, 0.94), x mirrored on
    the right) and farther from the middle than the radius r of the fitted sphere moves in to r.
    The Tripo balls are not round (the back reaches 1.09 r), and the lid must lie farther from the
    middle than each ball vertex. The front of the ball, which shows, stays."""
    angle = P.get('ballRound')
    if angle is None:
        return
    me = body.data
    S = studio_points(me)
    moved = 0
    for sign in (1.0, -1.0):
        roots = part_roots(me)
        ids = np.array([i for i in eyes if np.sign(S[roots == roots[i]][:, 0].mean()) == sign], int)
        q = S[ids]
        fit = np.linalg.lstsq(np.c_[2 * q, np.ones(len(q))], (q**2).sum(1), rcond=None)[0]
        c = fit[:3]
        r = float(np.sqrt(fit[3] + c @ c))
        g = np.array([0.35 * sign, 0.0, 0.94])
        g /= np.linalg.norm(g)
        v = q - c
        dist = np.linalg.norm(v, axis=1)
        far = (np.degrees(np.arccos(np.clip((v / dist[:, None]) @ g, -1, 1))) > angle) & (dist > r)
        S[ids[far]] = c + v[far] * (r / dist[far])[:, None]
        moved += int(far.sum())
        k = P.get('ballSphere')
        if k:
            # The front of the Tripo ball is not round: the pole stands out to 1.01 r and the ring
            # from 15 to 30 degrees about it lies at 0.95 r, so the reflection of the hall on it
            # showed as a wide glossy band. Each ball vertex then moves onto the sphere of k r
            # about c, so the ball shows one compact light.
            v = S[ids] - c
            S[ids] = c + v * (k * r / np.linalg.norm(v, axis=1))[:, None]
            log(
                f'round balls: the {len(ids)} ball vertices of side {sign:+.0f} move onto the sphere of '
                f'{k} r ({k * r:.5f}) about {np.round(c, 5).tolist()}'
            )
    set_studio_points(me, S)
    log(f'round balls: {moved} hidden ball vertices move in to the sphere of their ball')


def part_roots(me):
    """The root of the connected part of each vertex."""
    n = len(me.vertices)
    edges = np.empty(len(me.edges) * 2, int)
    me.edges.foreach_get('vertices', edges)
    par = np.arange(n)

    def find(i):
        while par[i] != i:
            par[i] = par[par[i]]
            i = par[i]
        return i

    for a, b in edges.reshape(-1, 2):
        ra, rb = find(a), find(b)
        if ra != rb:
            par[max(ra, rb)] = min(ra, rb)
    return np.array([find(i) for i in range(n)])


def loose_vertices(me):
    """The vertices of each small loose part (fewer than 100 vertices: the eyeballs and the inner
    mouth). The tail is a large loose part of the source, and it is not in this list."""
    roots = part_roots(me)
    count = np.bincount(roots)
    return np.nonzero(count[roots] < 100)[0].tolist()


def tail_vertices(me):
    """The vertices of the tail: the loose part of 100 or more vertices that is not the largest."""
    roots = part_roots(me)
    count = np.bincount(roots)
    largest = count.argmax()
    return np.nonzero((count[roots] >= 100) & (roots != largest))[0].tolist()


def segments(x, part, R):
    a, b = (R['shoulder'], R['elbow']) if part == 'upper_arm' else (R['elbow'], R['wrist'])
    u = min(max((x - a) / (b - a) * 4 - 0.5, 0.0), 3.0)
    k = min(int(np.floor(u)), 2)
    f = u - k
    return {n: w for n, w in ((f'{part}_seg{k}', 1 - f), (f'{part}_seg{k + 1}', f)) if w > 1e-9}


def arm_row(x, R):
    ctl = np.array(R['control'])
    # The control rows hold x of the source: an arm of the edit armStretch maps back.
    xs = float(ce.arm_source_x(x, P))
    clav, elbow, wrist = (float(np.interp(xs, ctl[:, 0], ctl[:, k])) for k in (1, 2, 3))
    rest = 1 - clav - elbow - wrist
    row = {
        n: w * rest for n, w in segments(x, 'upper_arm' if x < R['elbow'] else 'forearm', R).items()
    }
    for name, w in (('clavicle', clav), ('elbow', elbow), ('wrist', wrist)):
        if w > 0:
            row[name] = w
    return row


def blend_share(d, start, band, count):
    """The share of a place d in a blend of `count` equal steps, one in each band of `band` from
    `start`: (k + 0.5) / count in step k, 0 before the first step, and 1 after the last."""
    k = int(np.floor((d - start) / band))
    if k < 0:
        return 0.0
    if k >= count:
        return 1.0
    return (k + 0.5) / count


def exact_rows(body, rig, head_ids):
    """The exact rows of the arms and the paws, and {head 1} for the loose parts and the gloss
    nose. An arm vertex is a vertex of a side with |x| from rows.start, y below the shoulder joint plus 0.07, and a
    distance below rows.reach from the line of the rest arm (from the head of upper_arm to the
    head of hand). Its place is its x on the upper arm and the forearm, and the wrist place plus
    its distance d along the rest forearm axis past the head of hand on the paw.

    - Arm: {clavicle c, elbow e, the roll segments of the part the rest}, with c and e linear
      between the control rows (rows.control: x, clavicle, elbow helper).
    - Wrist: the bend share b of the paw (half the wrist helper, plus the paw bones) grows in
      rows.wrist.count equal steps, one in each band of rows.wrist.band from d = rows.wrist.start
      (the cat and the bear of round 12: one short step takes the whole bend and folds the palm).
      A row with b of 0.5 or less is {wrist 2b, the forearm row the rest}; above 0.5 it is
      {wrist 2 (1 - b), hand 2b - 1}.
    - Knuckles: from d = rows.knuckle.start past the head of fingers, the hand share of each row
      splits into hand and fingers by the fingers share f, which grows in rows.knuckle.count steps
      of rows.knuckle.band."""
    R = P['rows']
    me = body.data
    S = studio_points(me)
    count = {'arm': 0, 'wrist': 0, 'paw': 0}
    W, K = R['wrist'], R['knuckle']
    for side, sign in (('L', 1.0), ('R', -1.0)):
        bone = lambda n: np.array(rig.data.bones[f'{n}_{side}'].head_local) @ sa.TO_STUDIO.T
        ua, fh, hh, gh = bone('upper_arm'), bone('forearm'), bone('hand'), bone('fingers')
        axis = (hh - fh) / np.linalg.norm(hh - fh)
        line = (hh - ua) / np.linalg.norm(hh - ua)
        elbow_x, wrist_x = sign * fh[0], sign * hh[0]
        knuckle_d = (gh - hh) @ axis
        Rx = dict(
            R,
            shoulder=sign * ua[0],
            elbow=elbow_x,
            wrist=wrist_x,
            control=[[x, c, e, 0.0] for x, c, e in R['control']],
        )
        for i, p in enumerate(S):
            if i in head_ids or sign * p[0] < R['start'] or p[1] > ua[1] + 0.07:
                continue
            v = p - ua
            if np.linalg.norm(v - (v @ line) * line) > R['reach']:
                continue
            d = (p - hh) @ axis
            x = sign * p[0]
            base = arm_row(min(x, wrist_x - 1e-4), Rx)
            b = blend_share(d, W['start'], W['band'], W['count'])
            if b <= 0:
                row, kind = base, 'arm'
            elif b <= 0.5:
                row = {n: w * (1 - 2 * b) for n, w in base.items()}
                row['wrist'] = row.get('wrist', 0.0) + 2 * b
                kind = 'wrist'
            else:
                row, kind = {'wrist': 2 * (1 - b), 'hand': 2 * b - 1}, 'paw'
            f = blend_share(d - knuckle_d, K['start'], K['band'], K['count'])
            if f > 0 and 'hand' in row:
                h = row.pop('hand')
                row['hand'] = h * (1 - f)
                row['fingers'] = h * f
            row = {n: w for n, w in row.items() if w > 1e-6}
            sa.set_weight_row(body, i, {f'{n}_{side}': w for n, w in row.items()})
            count[kind] += 1
    for i in head_ids:
        sa.set_weight_row(body, i, {'head': 1.0})
    log('exact rows:', count, 'head rows', len(head_ids))


def tail_rows(body, rig):
    """Exact rows of the tail (a loose part of the source) along the line of its bones: with u the
    place of the vertex along the bone tail (0 at its head, 1 at its tail) and on to tail_tip,
    {hips 1 - a, tail a (1 - c), tail_tip a c}, with a = smoothstep(rowRoot) of the distance along
    the tail bone and c = smoothstep(-bend, bend) of the distance along tail_tip from its head."""
    rule = P['tailRows']
    me = body.data
    S = studio_points(me)
    ids = tail_vertices(me)
    bone = lambda n: (
        np.array(rig.data.bones[n].head_local) @ sa.TO_STUDIO.T,
        np.array(rig.data.bones[n].tail_local) @ sa.TO_STUDIO.T,
    )
    th, tt = bone('tail')
    kh, kt = bone('tail_tip')
    a1 = (tt - th) / np.linalg.norm(tt - th)
    a2 = (kt - kh) / np.linalg.norm(kt - kh)
    for i in ids:
        p = S[i]
        a = float(ce.smoothstep(rule['rowRoot'][0], rule['rowRoot'][1], (p - th) @ a1))
        c = float(ce.smoothstep(-rule['bend'], rule['bend'], (p - kh) @ a2))
        row = {'hips': 1 - a, 'tail': a * (1 - c), 'tail_tip': a * c}
        sa.set_weight_row(body, i, {n: w for n, w in row.items() if w > 1e-6})
    log(f'tail rows: {len(ids)} vertices')


def auto_weights(body, rig, head_ids):
    """Automatic Weights (bone heat) on a copy of the body with no loose part and no face on an
    edge of more than two faces (the 47 lip and lid edges of the source), because bone heat finds
    no solution on the full mesh. Then Limit Total 4 and Normalize All, and the rows of the copy go
    back to the body by vertex index. A vertex of the body with no row takes {head 1}: each such
    vertex lies in the face."""
    me = body.data
    copy = body.copy()
    copy.data = me.copy()
    bpy.context.scene.collection.objects.link(copy)
    idx = copy.data.attributes.new('orig', 'INT', 'POINT')
    idx.data.foreach_set('value', np.arange(len(me.vertices)))
    bm = bmesh.new()
    bm.from_mesh(copy.data)
    bm.verts.ensure_lookup_table()
    loose = set(loose_vertices(me)) | set(tail_vertices(me))
    shared = {f for e in bm.edges if len(e.link_faces) > 2 for f in e.link_faces}
    bmesh.ops.delete(bm, geom=list(shared), context='FACES_ONLY')
    bmesh.ops.delete(
        bm, geom=[v for v in bm.verts if v.index in loose or not v.link_faces], context='VERTS'
    )
    bm.to_mesh(copy.data)
    bm.free()
    for g in list(copy.vertex_groups):
        copy.vertex_groups.remove(g)
    empty = sa.skin_mesh(copy, rig, auto=True)
    orig = np.empty(len(copy.data.vertices), int)
    copy.data.attributes['orig'].data.foreach_get('value', orig)
    names = {g.index: g.name for g in copy.vertex_groups}
    rows = {}
    for v in copy.data.vertices:
        row = {names[g.group]: g.weight for g in v.groups if g.weight > 0}
        if row:
            rows[int(orig[v.index])] = row
    body.parent = rig
    body.modifiers.new('armature', 'ARMATURE').object = rig
    for name in [b.name for b in rig.data.bones if b.use_deform]:
        body.vertex_groups.get(name) or body.vertex_groups.new(name=name)
    # A body vertex with no row (the faces of the shared edges at the front of each armpit) takes
    # the mean row of its edge neighbors with a row, in rounds, so that it follows the skin
    # around it. The tail vertices take their rows later (tail_rows()).
    tail = set(tail_vertices(me))
    nbr = {i: [] for i in range(len(me.vertices))}
    for e in me.edges:
        a, b = e.vertices
        nbr[a].append(b)
        nbr[b].append(a)
    todo = [
        i for i in range(len(me.vertices)) if i not in rows and i not in head_ids and i not in tail
    ]
    filled = 0
    while todo:
        left = []
        for i in todo:
            got = [rows[j] for j in nbr[i] if j in rows]
            if not got:
                left.append(i)
                continue
            mean = {}
            for r in got:
                for n, w in r.items():
                    mean[n] = mean.get(n, 0.0) + w / len(got)
            rows[i] = mean
            filled += 1
        if len(left) == len(todo):
            break
        todo = left
    none = 0
    for i in range(len(me.vertices)):
        if i in head_ids:
            continue
        if i in rows:
            sa.set_weight_row(body, i, rows[i])
        else:
            sa.set_weight_row(body, i, {'head': 1.0})
            none += 1
    bpy.data.objects.remove(copy)
    log(
        'automatic weights on a copy:',
        len(shared),
        'faces of shared edges and',
        len(loose),
        'loose and tail vertices out,',
        empty,
        'copy vertices with no weight,',
        filled,
        'body vertices take the mean row of their neighbors,',
        none,
        'take head 1',
    )


def weights_of(body, names):
    """The summed weight of the bones `names` for each vertex."""
    idx = {g.index for g in body.vertex_groups if g.name in names}
    out = np.zeros(len(body.data.vertices))
    for v in body.data.vertices:
        out[v.index] = sum(g.weight for g in v.groups if g.group in idx)
    return out


def ear_rows(body):
    """Splits the head at the base of each ear by a plane (assets/models/fox/README.md, "Ear
    weights"): the automatic weights give the ear bones shares down to the eyes. With n the unit
    normal of the plane of the left ear base (x mirrored on the right), d = n . p - offset the
    height of a rest point p over it, and x its distance from the middle plane, each vertex of a
    side above y 0.7 with an ear share takes an exact row: {ear 1} for d at least `band` and x
    above `xmin` (the ear), {ear 0.5, head 0.5} for d from 0 to `band` (the ear base), and else its
    row with the ear share added to head."""
    rule = P.get('earPlane')
    if not rule:
        return
    me = body.data
    S = studio_points(me)
    names = {g.index: g.name for g in body.vertex_groups}
    # The plane goes through the points of the ear base of the source, mapped by the point edits.
    Q = ce.map_points(np.array(rule['points'], float), P)
    mid = Q.mean(0)
    n = np.linalg.svd(Q - mid)[2][2]
    n = n if n[1] > 0 else -n
    rule = dict(rule, offset=float(n @ mid))
    keep = set(loose_vertices(me)) | {
        i for p in me.polygons if p.material_index == 1 for i in p.vertices
    }
    floor = float(ce.map_points(np.array([[0, 0.7, 0.05]]), P)[0, 1])
    count = {'ear': 0, 'base': 0, 'head': 0}
    for v in me.vertices:
        p = S[v.index]
        if p[1] < floor or v.index in keep:
            continue
        side, sign = ('L', 1.0) if p[0] > 0 else ('R', -1.0)
        row = {names[g.group]: g.weight for g in v.groups if g.weight > 0}
        ear = row.pop('ear_L', 0.0) + row.pop('ear_R', 0.0)
        d = n @ (p * [sign, 1, 1]) - rule['offset']
        x = sign * p[0]
        if d >= rule['band'] and x > rule['xmin'] and set(row) <= {'head', 'neck'}:
            new, kind = {f'ear_{side}': 1.0}, 'ear'
        elif 0 <= d < rule['band'] and x > rule['xmin'] and set(row) <= {'head', 'neck'}:
            new, kind = {f'ear_{side}': 0.5, 'head': 0.5}, 'base'
        elif ear > 0:
            new = dict(row)
            new['head'] = new.get('head', 0.0) + ear
            kind = 'head'
        else:
            continue
        sa.set_weight_row(body, v.index, new)
        count[kind] += 1
    log('ear rows:', count, 'normal', np.round(n, 3).tolist(), 'offset', round(rule['offset'], 4))


def thicken_trunk(body):
    """Scales each horizontal section of the trunk about its middle in x (width) and z (depth) by the
    factors of trunk.table of the params, by the place u from the hips joint (0) to the neck joint
    (1), linear between the rows. The middle of each section lies on a quadratic fit in y of the
    middles of the trunk sections. Each vertex moves by its weight on the trunk bones (hips, spine,
    spine1, chest, neck) times the move, so the joins to the arms, the head, the tail, and the legs
    fade with the weights (assets/models/fox/README.md, "Body thickness")."""
    rule = P.get('trunk')
    if not rule:
        return
    me = body.data
    S = studio_points(me)
    t = np.minimum(weights_of(body, {'hips', 'spine', 'spine1', 'chest', 'neck'}), 1.0)
    y0 = CONFIG['joints']['hips']['head'][1]
    y1 = CONFIG['joints']['neck']['head'][1]
    core = (t > rule.get('core', 0.95)) & (np.abs(S[:, 0]) < 0.15)
    bins = np.arange(y0 - 0.06, y1 + 0.02, 0.02)
    mids = [(b + 0.01, S[core & (S[:, 1] >= b) & (S[:, 1] < b + 0.02)][:, [0, 2]]) for b in bins]
    mids = [(y, (q.max(0) + q.min(0)) / 2) for y, q in mids if len(q) >= 6]
    ys = np.array([m[0] for m in mids])
    cz = np.polyfit(ys, [m[1][1] for m in mids], 2)
    tab = np.array(rule['table'], float)
    u = (S[:, 1] - y0) / (y1 - y0)
    fw = np.interp(u, tab[:, 0], tab[:, 1])
    fd = np.interp(u, tab[:, 0], tab[:, 2])
    c_z = np.polyval(cz, S[:, 1])
    if tab.shape[1] > 3:
        # A fourth column gives the depth factor of the front half (the belly): the lap of the
        # seated cat lies under the belly, so a deeper belly would cover the place of the rest
        # viola and bow on the thighs (lapPoint() of src/pose/lap.ts).
        fd = np.where(S[:, 2] > c_z, np.interp(u, tab[:, 0], tab[:, 3]), fd)
    if 'frontWide' in rule:
        # The width grows less toward the front of the belly: at the front edge of a section only
        # frontWide of the growth stays, so the belly does not cover the lap of the seated cat
        # from above (legTop() of src/pose/lap.ts).
        front = np.zeros(len(S))
        for b0 in bins:
            m = (S[:, 1] >= b0) & (S[:, 1] < b0 + 0.02)
            if not m.any():
                continue
            reach = max(float((S[m, 2] - c_z[m]).max()), 1e-6)
            front[m] = np.clip((S[m, 2] - c_z[m]) / reach, 0, 1)
        fw = 1 + (fw - 1) * (1 - (1 - rule['frontWide']) * front)
    move = np.zeros_like(S)
    move[:, 0] = (fw - 1) * S[:, 0]
    move[:, 2] = (fd - 1) * (S[:, 2] - c_z)
    T = S + t[:, None] * move
    set_studio_points(me, T)
    log(
        'trunk: largest move',
        round(float(np.linalg.norm(T - S, axis=1).max()), 4),
        'units,',
        int((t * np.linalg.norm(move, axis=1) > 1e-4).sum()),
        'vertices; middle z fit',
        np.round(cz, 4).tolist(),
    )


def region_colors(body):
    """Gives each face one color of its region (assets/models/fox/README.md, "Smooth surface"): the
    face colors of add_surface() take the shade that the Tripo texture bakes. By the lightness L
    and the saturation S of the old color (HLS, sRGB): dark (L below 0.25: the socks, the paws,
    the ear tips, and the brows), cream (L at least 0.62: the bib, the cheeks, the muzzle, and the
    tail tip), and the orange fur. Each region takes the color of its face at 0.6 of its luma
    range. The gloss nose and the faces of the loose parts keep their colors."""
    import colorsys

    me = body.data
    rgba = np.empty(len(me.polygons) * 4, np.float32)
    me.attributes['color'].data.foreach_get('color', rgba)
    lin = rgba.reshape(-1, 4)[:, :3]
    srgb = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.clip(lin, 0, 1) ** (1 / 2.4) - 0.055)
    hls = np.array([colorsys.rgb_to_hls(*c) for c in srgb])
    eye = np.zeros(len(me.polygons), bool)
    me.attributes['eye'].data.foreach_get('value', eye)
    loose = set(loose_vertices(me))
    keep = eye | np.array([p.material_index == 1 or p.vertices[0] in loose for p in me.polygons])
    L = hls[:, 1]
    rule = P.get('regions', {'dark': 0.25, 'cream': 0.62})
    if 'white' in rule:
        hue = hls[:, 0] * 360
        pink = (
            ((hue < rule['pinkHue']) | (hue > rule['pinkHueHigh']))
            & (hls[:, 2] >= rule['pinkSat'])
            & (L > rule['pinkLight'])
            & ~keep
        )
        white = (L >= rule['white']) & ~pink & ~keep
        fur = ~pink & ~white & ~keep
        groups = (('pink', pink), ('white', white), ('fur', fur))
    elif 'pinkHue' in rule:
        hue = hls[:, 0] * 360
        pink = (hue < rule['pinkHue']) & (hls[:, 2] >= rule['pinkSat']) & ~keep
        fur = ~pink & ~keep
        groups = (('pink', pink), ('fur', fur))
    else:
        dark = (L < rule['dark']) & ~keep
        cream = (L >= rule['cream']) & ~keep
        fur = ~dark & ~cream & ~keep
        groups = (('dark', dark), ('cream', cream), ('fur', fur))
    luma = srgb @ [0.2126, 0.7152, 0.0722]
    out = srgb.copy()
    counts = {}
    for name, m in groups:
        if not m.any():
            continue
        lo, hi = np.percentile(luma[m], 2), np.percentile(luma[m], 98)
        target = lo + 0.6 * (hi - lo)
        pick = np.nonzero(m)[0][np.argmin(np.abs(luma[m] - target))]
        out[m] = srgb[pick]
        counts[name] = (int(m.sum()), [int(round(x * 255)) for x in srgb[pick]])
    new_lin = np.where(out <= 0.04045, out / 12.92, ((out + 0.055) / 1.055) ** 2.4)
    rgba = np.c_[new_lin, np.ones(len(new_lin))].astype(np.float32).ravel()
    for name in ('color', 'color_base'):
        me.attributes[name].data.foreach_set('color', rgba)
    log('region colors (faces, sRGB):', counts, 'kept', int(keep.sum()))


def relax(body, rounds=10, lam=0.5, mu=-0.53, clip=0.01):
    """Taubin relax of the body: each round moves each free vertex by lam, then by mu, times the
    mean of its edge neighbors less its place, with each total move clipped to `clip` units. The
    eyeballs, the loose parts, the gloss nose, the open edges (the eye sockets), and the vertices of
    the edges of more than two faces (the lip and lid lines) stay."""
    me = body.data
    S = studio_points(me)
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    held = set(loose_vertices(me))
    held |= {v for p in me.polygons if p.material_index == 1 for v in p.vertices}
    for e in bm.edges:
        if len(e.link_faces) != 2:
            held |= {v.index for v in e.verts}
    nbr = [[e.other_vert(v).index for e in v.link_edges] for v in bm.verts]
    bm.free()
    free = np.array([i not in held and len(nbr[i]) > 0 for i in range(len(S))])
    X = S.copy()
    for _ in range(rounds):
        for f in (lam, mu):
            mean = np.array([X[n].mean(0) if n else X[i] for i, n in enumerate(nbr)])
            X[free] += f * (mean[free] - X[free])
        d = X - S
        n = np.linalg.norm(d, axis=1)
        over = n > clip
        X[over] = S[over] + d[over] * (clip / n[over])[:, None]
    set_studio_points(me, X)
    n = np.linalg.norm(X - S, axis=1)
    log(
        f'relax: {rounds} Taubin rounds ({lam}, {mu}), {int(free.sum())} free vertices, largest move '
        f'{n.max():.4f}, mean {n[free].mean():.4f}, {int((n >= clip - 1e-9).sum())} clipped'
    )


def belly_key(body, rig):
    """The key `bind_belly`: relaxes the posed bind of the lower belly along the normals, as the
    rabbit and the fox (assets/models/rabbit/README.md, "Belly"), then moves the lower belly
    forward (the fox "Lap"). S: each vertex with rest z (Blender) from lo to hi, rest y below 0,
    theta = atan2(|x|, -y) at most 60 degrees, and a distance from the z axis below 0.2. Each
    round: P[i] += 0.5 ((mid - P[i]) . n[i]) n[i] for each i of S at the same time, with mid the
    middle of the mean of the edge neighbors above and the mean of those below (rest z more than
    0.01 apart), and n the vertex normal of the bind before the key. Then each vertex of S moves
    along -y (forward) by lap * ss(a, b, zb) * (1 - ss(c, d, zb)) * (1 + cos(pi theta / 60)) / 2,
    with zb its bind z."""
    rule = P.get('belly')
    if not rule:
        return
    sys.path.insert(0, os.path.join(ROOT, 'tools', 'blender'))
    import bind_edit as be

    me = body.data
    rest = np.array([v.co[:] for v in me.vertices])
    lo, hi = rule['z']
    theta = np.degrees(np.arctan2(np.abs(rest[:, 0]), -rest[:, 1]))
    S = np.nonzero(
        (rest[:, 2] >= lo)
        & (rest[:, 2] <= hi)
        & (rest[:, 1] < 0)
        & (theta <= 60)
        & (np.hypot(rest[:, 0], rest[:, 1]) < 0.2)
    )[0]
    restore = be.pose_bind(body, rig)
    Pb = be.bind_points(body)
    ev = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    em = ev.to_mesh()
    normals = np.array([v.normal[:] for v in em.vertices])
    ev.to_mesh_clear()
    nbr = {i: [] for i in S}
    for e in me.edges:
        a, b = e.vertices
        if a in nbr:
            nbr[a].append(b)
        if b in nbr:
            nbr[b].append(a)
    crotch = rule.get('crotch')

    def smooth_crotch(X, zr, rounds):
        """The raised thighs fold the faces of the crotch in the bind. A Laplacian smooth of the
        bind of the chosen vertices C unfolds them: each round moves each vertex of C by lam
        times the mean of its edge neighbors less its place, all at the same time."""
        C = np.nonzero(
            (rest[:, 2] >= zr[0])
            & (rest[:, 2] <= zr[1])
            & (np.abs(rest[:, 0]) < crotch['x'])
            & (rest[:, 1] < crotch['y'])
        )[0]
        around = {i: [] for i in C}
        for e in me.edges:
            a, b = e.vertices
            if a in around:
                around[a].append(b)
            if b in around:
                around[b].append(a)
        for _ in range(rounds):
            new = X.copy()
            for i in C:
                new[i] = X[i] + crotch['lam'] * (X[around[i]].mean(0) - X[i])
            X = new
        log(f'crotch: {len(C)} vertices, {rounds} rounds of {crotch["lam"]}')
        return X, C

    X = Pb.copy()
    moved = S
    if crotch:
        X, C = smooth_crotch(X, crotch['z'], crotch['rounds'])
        moved = np.union1d(S, C)
        if crotch.get('rim'):
            # The faces of the crotch take the face attribute rim: the app gives each corner the
            # mean of the normals of the fur faces at its vertex with no crease angle, so the fold
            # of the seated crotch shades smooth.
            inside = np.zeros(len(me.vertices), bool)
            inside[C] = True
            flags = np.array([inside[list(p.vertices)].all() for p in me.polygons])
            attr = me.attributes.get('rim') or me.attributes.new('rim', 'BOOLEAN', 'FACE')
            attr.data.foreach_set('value', flags)
            log(f'crotch rim: {int(flags.sum())} faces')
    for _ in range(rule.get('rounds', 4)):
        new = X.copy()
        for i in S:
            up = [j for j in nbr[i] if rest[j, 2] > rest[i, 2] + 0.01]
            down = [j for j in nbr[i] if rest[j, 2] < rest[i, 2] - 0.01]
            if not up or not down:
                continue
            mid = (X[up].mean(0) + X[down].mean(0)) / 2
            n = normals[i]
            new[i] = X[i] + 0.5 * ((mid - X[i]) @ n) * n
        X = new
    if 'lap' in rule:
        a, b, c, d = rule['lapBand']
        zb = Pb[moved, 2]
        th = np.degrees(np.arctan2(np.abs(rest[moved, 0]), -rest[moved, 1]))
        w = (
            ce.smoothstep(a, b, zb)
            * (1 - ce.smoothstep(c, d, zb))
            * (1 + np.cos(np.pi * np.minimum(th, 60) / 60))
            / 2
        )
        X[moved, 1] -= rule['lap'] * w
    if crotch and 'after' in crotch:
        X, C2 = smooth_crotch(X, crotch['after'], crotch['afterRounds'])
        moved = np.union1d(moved, C2)
    move = X - Pb
    count = be.add_bind_move(body, rig, move, 'bind_belly')
    restore()
    n = np.linalg.norm(move, axis=1)
    log(
        f'belly key: {count} vertices move, largest {n.max():.4f}, mean {n[S].mean():.4f}, bind z {Pb[S, 2].min():.3f} to {Pb[S, 2].max():.3f}'
    )


def color_map(body, eyes):
    """Gives the mesh object the property `texture` (the web copy of the color map, design 4.5)
    and the faces of the loose parts other than the eyeballs (the whisker strips and the small
    strips over the eyes) the face attribute `plain`, so that they keep their face colors."""
    rule = P.get('texture')
    if not rule:
        return
    me = body.data
    loose = (set(loose_vertices(me)) - set(eyes)) if rule.get('plainLoose') else set()
    if rule.get('plainSmall'):
        roots = part_roots(me)
        count = np.bincount(roots)
        loose = set(np.nonzero(count[roots] < rule['plainSmall'])[0].tolist())
    flags = np.array([bool(loose) and all(v in loose for v in p.vertices) for p in me.polygons])
    attr = me.attributes.get('plain') or me.attributes.new('plain', 'BOOLEAN', 'FACE')
    attr.data.foreach_set('value', flags)
    body['texture'] = rule['path']
    log(f'color map {rule["path"]}: {int(flags.sum())} plain faces')


def face_srgb(me):
    rgba = np.empty(len(me.polygons) * 4, np.float32)
    me.attributes['color'].data.foreach_get('color', rgba)
    lin = rgba.reshape(-1, 4)[:, :3]
    return np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.clip(lin, 0, 1) ** (1 / 2.4) - 0.055)


def set_face_srgb(me, faces, srgb):
    srgb = np.asarray(srgb, float) / 255
    lin = np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)
    for name in ('color', 'color_base'):
        data = me.attributes[name].data
        for f in faces:
            data[f].color = (*lin, 1.0)


def nose_trim(body):
    """The gloss nose of add_surface() holds the faces of the nose box: the pink nose and the light
    bridge above it, which showed as a flat light square. Each gloss face that is not pink by its
    old color (the test of region_colors(): h below 16 or above 340 degrees, S at least 0.38, and L
    above 0.35) goes back to the slot fur, so that it takes the color map."""
    import colorsys

    me = body.data
    srgb = face_srgb(me)
    back = []
    for p in me.polygons:
        if p.material_index != 1:
            continue
        h, L, S = colorsys.rgb_to_hls(*srgb[p.index])
        if not ((h * 360 < 16 or h * 360 > 340) and S >= 0.38 and L > 0.35):
            p.material_index = 0
            back.append(p.index)
    log(f'nose: {len(back)} light gloss faces go back to fur')


def brow_strips(body):
    """The brow whisker strips and the small strips over the eyes (the loose parts above the
    eyeballs) take the fur gray of the color map, so that they do not read as raised brows."""
    rule = P.get('browStrips')
    if not rule:
        return
    me = body.data
    S = studio_points(me)
    loose = set(loose_vertices(me))
    faces = [
        p.index
        for p in me.polygons
        if all(v in loose for v in p.vertices) and S[list(p.vertices), 1].min() > rule['above']
    ]
    set_face_srgb(me, faces, rule['srgb'])
    log(f'brow strips: {len(faces)} faces take sRGB {rule["srgb"]}')


def band_uvs(body):
    """Gives the new quads of the turned paw bands (face attribute `band`: 1 left, 2 right) the
    planar projection of their corners on their own plane (u along the rest forearm axis, v along
    the normal x the axis), at the median UV density of the faces next to the bands, about the
    clean patch `bandPatch.uv` of the color map, as the wrist bands of the fox (assets/models/fox/
    README.md, "Wrist bands"). The paw turn kept the UVs of the old band, so the UVs of the far
    ring met the UVs of the turned paw with a gap. Then the attribute goes."""
    rule = P.get('bandPatch')
    me = body.data
    attr = me.attributes.get('band')
    if attr is None:
        return
    flags = np.zeros(len(me.polygons), int)
    attr.data.foreach_get('value', flags)
    if rule:
        S = studio_points(me)
        uv = me.uv_layers.active.data
        band = np.nonzero(flags)[0]
        verts = {v for f in band for v in me.polygons[f].vertices}
        dens = []
        near_uv = []
        for p in me.polygons:
            if flags[p.index] or not any(v in verts for v in p.vertices):
                continue
            q = S[list(p.vertices)]
            u = np.array([uv[l].uv[:] for l in p.loop_indices])
            a3 = 0.5 * np.linalg.norm(
                sum(np.cross(q[i] - q[0], q[i + 1] - q[0]) for i in range(1, len(q) - 1))
            )
            u2 = 0.5 * abs(
                sum(np.cross(u[i] - u[0], u[i + 1] - u[0]) for i in range(1, len(u) - 1))
            )
            if a3 > 1e-9:
                dens.append(np.sqrt(u2 / a3))
            near_uv.append(u.mean(axis=0).tolist())
        density = float(np.median(dens))
        json.dump(near_uv, open(os.path.join(OUT, 'band-near.json'), 'w'))
        center = np.array(rule['uv'], float)
        for f in band:
            p = me.polygons[f]
            side = 'L' if flags[f] == 1 else 'R'
            _, axis = ce.paw_axis(CONFIG['joints'], side)
            q = S[list(p.vertices)]
            n = np.array(p.normal[:]) @ sa.TO_STUDIO.T
            a = axis - (axis @ n) * n
            a /= np.linalg.norm(a)
            b = np.cross(n, a)
            mid = q.mean(axis=0)
            for l, v in zip(p.loop_indices, p.vertices):
                d = S[v] - mid
                uv[l].uv = (center + density * np.array([d @ a, d @ b])).tolist()
        log(f'band UVs: {len(band)} faces about UV {rule["uv"]} at {density:.3f} UV for each unit')
    me.attributes.remove(me.attributes['band'])


def rot(axis, angle):
    a = np.asarray(axis, float) / np.linalg.norm(axis)
    K = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    return np.eye(3) + np.sin(angle) * K + (1 - np.cos(angle)) * K @ K


def lid_frames(body):
    """The frame of each eye in the Blender axes: the middle c and radius r of the sphere of the
    ball, the open eye g (the mean direction of the ball points that a ray from outside the head
    reaches), u (+Z made square to g), and the hinge h = u x g. Also the BVH of the head surface
    (no eye, no loose part) and the ball faces of each side."""
    from mathutils.bvhtree import BVHTree

    me = body.data
    eye = np.zeros(len(me.polygons), bool)
    me.attributes['eye'].data.foreach_get('value', eye)
    loose = set(loose_vertices(me))
    co = np.array([v.co[:] for v in me.vertices])
    head = [p.vertices[:] for p in me.polygons if not eye[p.index] and p.vertices[0] not in loose]
    bvh = BVHTree.FromPolygons([tuple(v) for v in co], head)
    out = {}
    for side, sign in (('L', 1.0), ('R', -1.0)):
        faces = [p.index for p in me.polygons if eye[p.index] and sign * co[p.vertices[0], 0] > 0]
        ids = sorted({v for f in faces for v in me.polygons[f].vertices})
        q = co[ids]
        fit = np.linalg.lstsq(np.c_[2 * q, np.ones(len(q))], (q**2).sum(1), rcond=None)[0]
        c = fit[:3]
        r = float(np.sqrt(fit[3] + c @ c))
        seen = []
        for v in q:
            d = (v - c) / np.linalg.norm(v - c)
            hit = bvh.ray_cast(Vector((v + 1e-4 * d).tolist()), Vector(d.tolist()), 1.0)
            if hit[0] is None:
                seen.append(d)
        g = np.mean(seen, axis=0)
        g /= np.linalg.norm(g)
        u = np.array([0.0, 0.0, 1.0]) - g[2] * g
        u /= np.linalg.norm(u)
        h = np.cross(u, g)
        seen = np.array(seen)
        psi = np.degrees(np.arctan2(seen @ u, seen @ g))
        lam = np.degrees(np.arcsin(np.clip(seen @ h, -1, 1)))
        out[side] = dict(
            c=c,
            r=r,
            g=g,
            u=u,
            h=h,
            faces=faces,
            psi=(psi.min(), psi.max()),
            lam=(lam.min(), lam.max()),
            seen=len(seen),
            balls=len(q),
        )
    return out, bvh


def lid_line(me, c, r, sign, eye_v):
    """The vertices of the upper lid line of one eye: the ends of the edges of three faces of the
    head within 2.5 ball radii of the middle c, on the side of the sign of x."""
    bm = bmesh.new()
    bm.from_mesh(me)
    out = set()
    for e in bm.edges:
        a, b = e.verts
        if len(e.link_faces) != 3 or a.index in eye_v or b.index in eye_v:
            continue
        for v in (a, b):
            p = np.array(v.co[:])
            if np.linalg.norm(p - c) < 2.5 * r and sign * p[0] > 0:
                out.add(v.index)
    bm.free()
    return sorted(out)


def open_lids(body):
    """Turns the upper lid of each eye up about the hinge h through the middle c of the ball, so
    that the lid edge covers less of the iris (a calm, open eye). For each vertex of the head
    near the eye (no eyeball vertex): lam = atan2(d.h, d.g) and psi = asin(d.u / |d|), with d = P - c,
    and the turn w * angle, with w the product of
      a: smoothstep(psi_line - below[0], psi_line - below[1], psi), psi_line the psi of the lid line
         at lam (linear between the lid line vertices),
      b: 1 - smoothstep(psi_line + above[0], psi_line + above[1], psi),
      c: 1 - smoothstep(reach[0], reach[1], |d| / r),
      e: smoothstep(-inner[0], inner[1], s) * (1 - smoothstep(outer[0], outer[1], s)), with s the
         place from the inner end (0) to the outer end (1) of the lid line by lam.
    A loose part (a whisker strip) turns rigidly with the w of its middle."""
    rule = P.get('lidOpen')
    if not rule or not rule.get('angle'):
        return
    me = body.data
    frames, _ = lid_frames(body)
    co = np.array([v.co[:] for v in me.vertices])
    eye_attr = np.zeros(len(me.polygons), bool)
    me.attributes['eye'].data.foreach_get('value', eye_attr)
    eye_v = {v for p in me.polygons if eye_attr[p.index] for v in p.vertices}
    loose = loose_vertices(me)
    parts = {}
    if loose:
        sub = set(loose)
        par = {i: i for i in loose}

        def find(i):
            while par[i] != i:
                par[i] = par[par[i]]
                i = par[i]
            return i

        for e in me.edges:
            a, b = e.vertices
            if a in sub and b in sub:
                ra, rb = find(a), find(b)
                if ra != rb:
                    par[max(ra, rb)] = min(ra, rb)
        for i in loose:
            parts.setdefault(find(i), []).append(i)
    ang = np.radians(rule['angle'])
    out = co.copy()
    report = {}
    for side, sign in (('L', 1.0), ('R', -1.0)):
        f = frames[side]
        c, r, g, u, h = f['c'], f['r'], f['g'], f['u'], f['h']
        line = lid_line(me, c, r, sign, eye_v)
        d = co[line] - c
        lam_l = np.degrees(np.arctan2(d @ h, d @ g))
        psi_l = np.degrees(np.arcsin(np.clip((d @ u) / np.linalg.norm(d, axis=1), -1, 1)))
        order = np.argsort(lam_l)
        lam_l, psi_l = lam_l[order], psi_l[order]
        # The outer end of the eye: +h is +x, so it is the largest lam on the left side.
        inner_end, outer_end = (lam_l[0], lam_l[-1]) if sign > 0 else (lam_l[-1], lam_l[0])

        def weight(p):
            d = p - c
            n = np.linalg.norm(d, axis=-1)
            lam = np.degrees(np.arctan2(d @ h, d @ g))
            psi = np.degrees(np.arcsin(np.clip((d @ u) / np.maximum(n, 1e-9), -1, 1)))
            pl = np.interp(lam, lam_l, psi_l)
            s = (lam - inner_end) / (outer_end - inner_end)
            w = ce.smoothstep(pl - rule['below'][0], pl - rule['below'][1], psi)
            w = w * (1 - ce.smoothstep(pl + rule['above'][0], pl + rule['above'][1], psi))
            w = w * (1 - ce.smoothstep(rule['reach'][0], rule['reach'][1], n / r))
            w = w * ce.smoothstep(-rule['inner'][0], rule['inner'][1], s)
            w = w * (1 - ce.smoothstep(rule['outer'][0], rule['outer'][1], s))
            return w * (d @ g > -0.2 * r)

        ids = np.array(
            [
                i
                for i in range(len(co))
                if i not in eye_v
                and sign * co[i, 0] > 0
                and np.linalg.norm(co[i] - c) < rule['reach'][1] * r
            ]
        )
        loose_set = set(loose)
        body_ids = np.array([i for i in ids if i not in loose_set], int)
        w = weight(co[body_ids])
        for i, wi in zip(body_ids, w):
            out[i] = c + rot(h, -ang * wi) @ (co[i] - c)
        moved_parts = 0
        for root, ids_p in parts.items():
            if any(i in eye_v for i in ids_p):
                continue
            mid = co[ids_p].mean(0)
            if sign * mid[0] <= 0:
                continue
            wp = float(weight(mid[None])[0])
            if wp > 0:
                moved_parts += 1
                R = rot(h, -ang * wp)
                out[ids_p] = (co[ids_p] - c) @ R.T + c
        report[side] = dict(
            line=len(line),
            lam=[round(float(lam_l[0]), 1), round(float(lam_l[-1]), 1)],
            psi_max=round(float(psi_l.max()), 1),
            moved=int((w > 1e-3).sum()),
            parts=moved_parts,
            largest=round(float(np.linalg.norm(out - co, axis=1).max()), 4),
        )
    for v, p in zip(me.vertices, out):
        v.co = p.tolist()
    me.update()
    log(f'open lids: {rule["angle"]} deg, {report}')


def mouth_corners(body):
    """Lifts the corners of the mouth (a smile): each vertex of the head near the lip line (the
    edges of four faces below the eyes, |x| below the corner x) moves up (+Z) by
    lift * smoothstep(x0, x1, |x|) * (1 - smoothstep(x2, x3, |x|)) * (1 - smoothstep(g0, g1, e)),
    with e the distance in y and z from the lip line at min(|x|, corner x). The loose parts stay."""
    rule = P.get('mouth')
    if not rule or not rule.get('lift'):
        return
    me = body.data
    co = np.array([v.co[:] for v in me.vertices])
    bm = bmesh.new()
    bm.from_mesh(me)
    lip = set()
    for e in bm.edges:
        a, b = e.verts
        if len(e.link_faces) == 4 and a.co.z < 0.85 and abs(a.co.x) < rule['corner'] + 0.01:
            lip |= {a.index, b.index}
    bm.free()
    lip = sorted(lip)
    ax = np.abs(co[lip, 0])
    order = np.argsort(ax)
    lx, ly, lz = ax[order], co[lip, 1][order], co[lip, 2][order]
    loose = set(loose_vertices(me))
    x0, x1, x2, x3 = rule['x']
    g0, g1 = rule['reach']
    moved = 0
    for v in me.vertices:
        if v.index in loose:
            continue
        p = co[v.index]
        a = abs(p[0])
        if a > x3:
            continue
        q = min(a, rule['corner'])
        e = np.hypot(p[1] - np.interp(q, lx, ly), p[2] - np.interp(q, lx, lz))
        w = (
            ce.smoothstep(x0, x1, a)
            * (1 - ce.smoothstep(x2, x3, a))
            * (1 - ce.smoothstep(g0, g1, e))
        )
        if w > 0:
            v.co.z += rule['lift'] * w
            moved += 1
    me.update()
    log(f'mouth corners: lift {rule["lift"]}, lip line {len(lip)} vertices, {moved} vertices move')


def lower_lids(body):
    """Turns the skin of the upper lid of each eye down about the hinge h through the middle c of
    the ball (the frames of lid_frames()), so that the upper lid line covers the top of the iris,
    as on the reference sheet: a full ring of white above the iris reads startled. For each head
    vertex of the side with d = P - c (no eyeball, no loose part), psi = atan2(d . u, d . g) (up
    from the eye axis), lam = atan2(d . h, d . g), and |d| in ball radii r, the turn is
    angle * ss(psi0, psi1, psi) * (1 - ss(psi2, psi3, psi)) * (1 - ss(r0, r1, |d| / r)) *
    (1 - ss(l0, l1, |lam|)). A turn about c keeps the distance from c, so no vertex goes into the
    ball."""
    rule = P.get('lidLower')
    if not rule or not rule.get('angle'):
        return
    me = body.data
    frames, _ = lid_frames(body)
    co = np.array([v.co[:] for v in me.vertices])
    keep = set(loose_vertices(me))
    ang = np.radians(rule['angle'])
    report = {}
    out = co.copy()
    for side, sign in (('L', 1.0), ('R', -1.0)):
        f = frames[side]
        c, r, g, u, h = f['c'], f['r'], f['g'], f['u'], f['h']
        d = co - c
        n = np.linalg.norm(d, axis=1)
        psi = np.degrees(np.arctan2(d @ u, d @ g))
        lam = np.degrees(np.arctan2(d @ h, d @ g))
        p0, p1, p2, p3 = rule['psi']
        r0, r1 = rule['reach']
        l0, l1 = rule['lam']
        w = (
            ce.smoothstep(p0, p1, psi)
            * (1 - ce.smoothstep(p2, p3, psi))
            * (1 - ce.smoothstep(r0, r1, n / r))
            * (1 - ce.smoothstep(l0, l1, np.abs(lam)))
        )
        w[[i for i in range(len(co)) if i in keep or sign * co[i, 0] <= 0]] = 0
        w[d @ g < 0] = 0
        moved = 0
        for i in np.nonzero(w > 1e-4)[0]:
            # A turn about h by +angle takes the lid down (lids(): +angle closes a lid).
            out[i] = c + rot(h, ang * w[i]) @ (co[i] - c)
            moved += 1
        report[side] = dict(
            moved=moved, largest=round(float(np.linalg.norm(out - co, axis=1).max()), 4)
        )
    for v, p_ in zip(me.vertices, out):
        v.co = p_.tolist()
    me.update()
    log(f'lower lids: {rule["angle"]} deg, {report}')


#: The length of the ray casts of the lid checks, in units (lids.rayReach of the params, else
#: 0.3). The head of the badger is long: a ray from the back of an eye goes about 0.31 units to the
#: back of the head, so a ray of 0.3 units missed the head for points that lie in it.
RAY_REACH = P.get('lids', {}).get('rayReach', 0.3)


def lid_inside(bvh, c, points):
    """True for each point under the head surface: a ray from it away from the middle c hits the
    head within RAY_REACH."""
    out = []
    for p in points:
        d = (p - c) / np.linalg.norm(p - c)
        out.append(
            bvh.ray_cast(Vector((p + 1e-5 * d).tolist()), Vector(d.tolist()), RAY_REACH)[0]
            is not None
        )
    return np.array(out)


def lids(body):
    """Opens the back of each eyeball and adds a blink lid to each eye (assets/models/fox/README.md,
    "Lids" and "Eye light"). The 8 or so ball faces whose corners all lie more than `back` degrees
    from g go, so that the vector area of the ball gives the eye axis. Each closed lid spans psi
    (from g toward u) and lam (toward h) over the ranges of the rule, at `radius` times the ball
    radius, with an extra row at the lowest psi and `strip` times the radius that turns in toward
    the ball. The file holds the open lid, each point turned up by `angle` degrees about h through
    c. The lid faces take the slot fur, the face attribute lid, the fur face colors, the UVs of the
    planar projection of the closed lid on the plane of h and u at `density` UV for each unit about
    the clean patch `uv`, and the row head 1. The armature takes the property lids."""
    rule = P.get('lids')
    if not rule:
        return
    me = body.data
    frames, bvh = lid_frames(body)
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    gone = []
    for side, f in frames.items():
        for fi in f['faces']:
            face = bm.faces[fi]
            d = np.array([v.co[:] for v in face.verts]) - f['c']
            d /= np.linalg.norm(d, axis=1)[:, None]
            sign = 1.0 if side == 'L' else -1.0
            # The balls of the cat reach over the middle plane into the head: a ball face with a
            # corner on the other side goes too, so that each ball lies on its own side.
            cross = any(sign * v.co.x < rule.get('midClear', -1.0) for v in face.verts)
            if cross or np.all(np.degrees(np.arccos(np.clip(d @ f['g'], -1, 1))) > rule['back']):
                gone.append(face)
    bmesh.ops.delete(bm, geom=gone, context='FACES_ONLY')
    loose_v = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose_v, context='VERTS')
    if rule.get('refit'):
        # The middle and the radius of each ball come again from the ball vertices that stay, as
        # the export finds the middle of each eye (ball_middle() of tools/blender/export_rig.py).
        eye_layer = bm.faces.layers.bool.get('eye')
        for side, sign in (('L', 1.0), ('R', -1.0)):
            q = np.array(
                sorted(
                    {
                        tuple(v.co)
                        for f in bm.faces
                        if f[eye_layer]
                        for v in f.verts
                        if sign * v.co.x > 0
                    }
                )
            )
            fit = np.linalg.lstsq(np.c_[2 * q, np.ones(len(q))], (q**2).sum(1), rcond=None)[0]
            frames[side]['c'] = fit[:3]
            frames[side]['r'] = float(np.sqrt(fit[3] + fit[:3] @ fit[:3]))
    uv = bm.loops.layers.uv.active
    lid_layer = bm.faces.layers.bool.get('lid') or bm.faces.layers.bool.new('lid')
    col = bm.faces.layers.float_color.get('color')
    base = bm.faces.layers.float_color.get('color_base')
    fur = np.array(rule['srgb'], float) / 255
    fur = np.where(fur <= 0.04045, fur / 12.92, ((fur + 0.055) / 1.055) ** 2.4)
    ang = np.radians(rule['angle'])
    new_verts = []
    report = {}
    for side, f in frames.items():
        c, r, g, u, h = f['c'], f['r'], f['g'], f['u'], f['h']
        psis = np.radians(np.linspace(*rule['psi'], rule['steps'][0] + 1))
        # lam grows toward +x on both sides (h = u x g), so the inner end of the left lid is its
        # low end and the inner end of the right lid its high end: the right side mirrors the range.
        lam_range = rule['lam'] if side == 'L' else [-rule['lam'][1], -rule['lam'][0]]
        lams = np.radians(np.linspace(*lam_range, rule['steps'][1] + 1))
        rows = [(psis[0], rule['strip'])] + [(p, rule['radius']) for p in psis]
        closed = np.array(
            [
                [
                    c + k * r * (np.cos(l) * (np.cos(p) * g + np.sin(p) * u) + np.sin(l) * h)
                    for l in lams
                ]
                for p, k in rows
            ]
        )
        R_open = rot(h, -ang)
        opened = (closed - c) @ R_open.T + c
        if 'lidClear' in rule:
            # The eyes of the cat lie close to the middle plane, so the inner side of an open lid
            # can reach over it. Each such point of the open lid moves onto the plane x = lidClear
            # on its own side, at the same distance from the middle c (its y and z offsets from c
            # scale), so that the lid stays as far from c as before. The closed lid follows by the
            # same turn.
            sign = 1.0 if side == 'L' else -1.0
            flat = opened.reshape(-1, 3)
            over = sign * flat[:, 0] < rule['lidClear']
            v = flat[over] - c
            dist = np.linalg.norm(v, axis=1)
            dx = sign * rule['lidClear'] - c[0]
            k = np.sqrt(np.maximum(dist**2 - dx**2, 0)) / np.linalg.norm(v[:, 1:], axis=1)
            flat[over] = np.c_[np.full(len(v), c[0] + dx), c[1] + k * v[:, 1], c[2] + k * v[:, 2]]
            opened = flat.reshape(opened.shape)
            closed = (opened - c) @ R_open + c
            log(
                f'lid {side}: {int(over.sum())} open lid points move onto the plane x = {sign * rule["lidClear"]}'
            )
        grid = [
            [bm.verts.new(opened[i, j].tolist()) for j in range(len(lams))]
            for i in range(len(rows))
        ]
        for i in range(len(rows) - 1):
            for j in range(len(lams) - 1):
                quad = [grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]]
                face = bm.faces.new(quad)
                mid = closed[i : i + 2, j : j + 2].reshape(-1, 3).mean(0)
                face.normal_update()
                fn = np.array(face.normal[:])
                if fn @ (rot(h, -ang) @ (mid - c)) < 0:
                    face.normal_flip()
                face.material_index = 0
                face.smooth = False
                face[lid_layer] = True
                for layer in (col, base):
                    if layer is not None:
                        face[layer] = (*fur, 1.0)
                for loop in face.loops:
                    ii, jj = next(
                        (a, b)
                        for a in range(len(rows))
                        for b in range(len(lams))
                        if grid[a][b] is loop.vert
                    )
                    d = closed[ii, jj] - c
                    loop[uv].uv = (
                        np.array(rule['uv']) + rule['density'] * np.array([d @ h, d @ u])
                    ).tolist()
        new_verts += [v for row in grid for v in row]
        # Ray casts in each step of the blink: the open lid, the side edges, and the back edge
        # must stay under the head; the lower strip of the closed lid too.
        counts = []
        for t in np.linspace(0, 1, 21):
            P_t = (closed - c) @ rot(h, -ang * (1 - t)).T + c
            if t == 0:
                pts = P_t.reshape(-1, 3)
            else:
                pts = np.vstack([P_t[:, 0], P_t[:, -1], P_t[-1]])
            counts.append(int((~lid_inside(bvh, c, pts)).sum()))
        strip = int((~lid_inside(bvh, c, closed[0])).sum())
        depth = []
        for p in opened.reshape(-1, 3):
            d = (p - c) / np.linalg.norm(p - c)
            hit = bvh.ray_cast(Vector(p.tolist()), Vector(d.tolist()), RAY_REACH)
            depth.append(hit[3] if hit[0] is not None else -1)
        report[side] = dict(
            r=round(r, 5),
            seen=f['seen'],
            psi=np.round(f['psi'], 1).tolist(),
            lam=np.round(f['lam'], 1).tolist(),
            out=counts,
            strip_out=strip,
            open_depth=round(float(min(depth)), 4),
            h=np.round(h, 6).tolist(),
        )
    bm.to_mesh(me)
    bm.free()
    me.update()
    # The new lid vertices can take the slots of the deleted ball vertices, so they come from the
    # lid faces, not from the end of the list.
    flags = np.zeros(len(me.polygons), bool)
    me.attributes['lid'].data.foreach_get('value', flags)
    ids = sorted({v for p in me.polygons if flags[p.index] for v in p.vertices})
    for i in ids:
        sa.set_weight_row(body, i, {'head': 1.0})
    rig = body.parent
    rig['lids'] = {
        'angle': round(float(ang), 6),
        'L': [round(float(x), 6) for x in frames['L']['h']],
        'R': [round(float(x), 6) for x in frames['R']['h']],
    }
    log(f'lids: {len(gone)} back ball faces go, {len(new_verts)} lid vertices; {report}')


def tail_mask(S):
    """The vertices of the flat tail, a part of the body: rest z below tailRule.z (behind the
    haunch) and y below tailRule.yMax."""
    rule = P['tailRule']
    return (S[:, 2] < rule['z']) & (S[:, 1] < rule['yMax'])


def tail_rows_body(body, rig):
    """Exact rows of the flat tail along its two bones: {hips 1 - a, tail a (1 - c), tail_tip a c},
    with a = smoothstep(rowRoot) of the distance along the bone tail from its head, and c =
    smoothstep(-bend, bend) of the distance along tail_tip from its head. Each other vertex gives its
    tail weights to the hips, so that the haunch follows the pelvis."""
    rule = P['tailRule']
    me = body.data
    S = studio_points(me)
    ids = np.nonzero(tail_mask(S))[0]
    bone = lambda n: (
        np.array(rig.data.bones[n].head_local) @ sa.TO_STUDIO.T,
        np.array(rig.data.bones[n].tail_local) @ sa.TO_STUDIO.T,
    )
    th, tt = bone('tail')
    kh, kt = bone('tail_tip')
    a1 = (tt - th) / np.linalg.norm(tt - th)
    a2 = (kt - kh) / np.linalg.norm(kt - kh)
    for i in ids:
        p = S[i]
        a = float(ce.smoothstep(rule['rowRoot'][0], rule['rowRoot'][1], (p - th) @ a1))
        c = float(ce.smoothstep(-rule['bend'], rule['bend'], (p - kh) @ a2))
        row = {'hips': 1 - a, 'tail': a * (1 - c), 'tail_tip': a * c}
        sa.set_weight_row(body, int(i), {n: w for n, w in row.items() if w > 1e-6})
    tube = set(ids.tolist())
    moved = 0
    for v in me.vertices:
        if v.index in tube:
            continue
        row = {body.vertex_groups[g.group].name: g.weight for g in v.groups if g.weight > 0}
        tw = row.pop('tail', 0.0) + row.pop('tail_tip', 0.0)
        if tw > 0:
            row['hips'] = row.get('hips', 0.0) + tw
            sa.set_weight_row(body, v.index, row)
            moved += 1
    log(
        f'tail rows: {len(ids)} tail vertices, y {S[ids, 1].min():.3f} to {S[ids, 1].max():.3f}, '
        f'z {S[ids, 2].min():.3f} to {S[ids, 2].max():.3f}; {moved} other vertices give their tail '
        f'weights to the hips'
    )


def mesh_edges(me):
    return [tuple(e.vertices) for e in me.edges]


def tail_line(body):
    """The middle line of the rest tail (tail.py), the tube vertices, and their places."""
    rule = P['tailLay']
    S = studio_points(body.data)
    line, dist = tl.middle_line(S, mesh_edges(body.data), rule)
    tube, place = tl.tube_mask(S, line, dist, rule)
    return line, np.nonzero(tube)[0], place


def tail_rows(body, rig):
    """Exact rows of the tail tube along its middle line: {hips 1 - a, tail a (1 - b), tail_tip a b},
    with a = smoothstep(root ramp, place) and b = smoothstep(bend - w, bend + w, place), the bend
    the place of the head of tail_tip on the line. Each other vertex gives its tail weights to the
    hips, so that the haunch follows the pelvis."""
    rule = P['tailLay']
    line, ids, place = tail_line(body)
    head = np.array(rig.data.bones['tail_tip'].head_local) @ sa.TO_STUDIO.T
    bend = float(tl.line_place(head[None], line)[0][0])
    a = tl.smoothstep(*rule['rowRoot'], place[ids])
    b = tl.smoothstep(bend - rule['rowBend'], bend + rule['rowBend'], place[ids])
    for i, ai, bi in zip(ids, a, b):
        sa.set_weight_row(
            body,
            int(i),
            {
                n: w
                for n, w in (('hips', 1 - ai), ('tail', ai * (1 - bi)), ('tail_tip', ai * bi))
                if w > 1e-6
            },
        )
    groups = {g.name: g.index for g in body.vertex_groups}
    tube = set(ids.tolist())
    moved = 0
    for v in body.data.vertices:
        if v.index in tube:
            continue
        row = {body.vertex_groups[g.group].name: g.weight for g in v.groups if g.weight > 0}
        tw = row.pop('tail', 0.0) + row.pop('tail_tip', 0.0)
        if tw > 0:
            row['hips'] = row.get('hips', 0.0) + tw
            sa.set_weight_row(body, v.index, row)
            moved += 1
    log(
        f'tail rows: {len(ids)} tube vertices, line {len(line)} points from {np.round(line[0], 3).tolist()} '
        f'to {np.round(line[-1], 3).tolist()}, bend at place {bend:.3f}; {moved} other vertices give '
        f'their tail weights to the hips'
    )


def tail_key(body, rig):
    """The key `bind_tail`: lays the tail tube of the bind along the path of tailLay (relative to
    the bind of the root of the middle line, which follows the hips), with the offsets of each
    vertex from the line in the moving frames (tail.lay()). Each vertex moves by the smoothstep of
    its place over the root ramp, then `smooth` Taubin rounds by the same share."""
    import bind_edit as be

    rule = P['tailLay']
    line, ids, place = tail_line(body)
    restore = be.pose_bind(body, rig)
    Pb = be.bind_points(body) @ sa.TO_STUDIO.T
    pb = rig.pose.bones['hips']
    mat = np.array(pb.matrix @ rig.data.bones['hips'].matrix_local.inverted())
    turn = sa.TO_STUDIO @ mat[:3, :3] @ sa.TO_STUDIO.T
    root = (mat @ np.r_[line[0] @ sa.TO_STUDIO, 1.0])[:3] @ sa.TO_STUDIO.T
    new, ls, lc = tl.lay(
        studio_points(body.data)[ids],
        place[ids],
        line,
        turn,
        root,
        np.array(rule['path'], float),
        np.radians(rule.get('roll', 0.0)),
    )
    share = tl.smoothstep(*rule['ramp'], place[ids])
    out = Pb.copy()
    out[ids] = Pb[ids] + share[:, None] * (new - Pb[ids])
    if rule.get('smooth'):
        rm = sa.rig_mesh_lib()
        body.data.calc_loop_triangles()
        tris = np.array([t.vertices[:] for t in body.data.loop_triangles])
        out = rm['taubin'](out, tris, ids, share, rule['smooth'])
    move = (out - Pb) @ sa.TO_STUDIO
    count = be.add_bind_move(body, rig, move, 'bind_tail')
    restore()
    n = np.linalg.norm(out - Pb, axis=1)
    T = out[ids]
    log(
        f'tail key: {count} vertices move, largest {n.max():.4f}; line {ls:.3f} long, path {lc:.3f}; '
        f'root {np.round(root, 4).tolist()}; tube x {T[:, 0].min():.3f} to {T[:, 0].max():.3f}, '
        f'y {T[:, 1].min():.4f} to {T[:, 1].max():.4f}, z {T[:, 2].min():.4f} to {T[:, 2].max():.4f}'
    )


def mouth_rim(body):
    """Gives the faces of the mouth slit the face attribute `rim`: the app gives each corner of a
    rim face the mean normal of the fur faces at its vertex with no crease angle, so the slit
    shades as the lips around it. The slit faces are the fur faces of the body in the box mouthRim.box (x
    half width, y range, z range, in the source) with a corner more than mouthRim.depth behind the front
    skin (the largest z of the points within mouthRim.near in x and y). The deep slit of the
    source shaded as a thick, wide, dark line."""
    rule = P.get('mouthRim')
    if not rule:
        return
    me = body.data
    S = studio_points(me)
    hx, y0, y1, z0, z1 = rule['box']
    # The box is in the places of the source: its heights take the point edits (the longer shins
    # lift the head).
    y0, y1 = (
        float(y) for y in ce.map_points(np.array([[0, y0, 0.2], [0, y1, 0.2]], float), P)[:, 1]
    )
    loose = set(loose_vertices(me))
    inside = (
        (np.abs(S[:, 0]) < hx)
        & (S[:, 1] > y0)
        & (S[:, 1] < y1)
        & (S[:, 2] > z0)
        & (S[:, 2] < z1)
        & ~np.isin(np.arange(len(S)), list(loose))
    )
    ids = np.nonzero(inside)[0]
    Q = S[ids]
    front = np.array(
        [
            Q[
                (np.abs(Q[:, 0] - q[0]) < rule['near']) & (np.abs(Q[:, 1] - q[1]) < rule['near']), 2
            ].max()
            for q in Q
        ]
    )
    deep = np.zeros(len(S), bool)
    deep[ids[front - Q[:, 2] > rule['depth']]] = True
    flags = np.array(
        [
            p.material_index == 0
            and all(inside[v] for v in p.vertices)
            and any(deep[v] for v in p.vertices)
            for p in me.polygons
        ]
    )
    attr = me.attributes.get('rim') or me.attributes.new('rim', 'BOOLEAN', 'FACE')
    old = np.zeros(len(me.polygons), bool)
    attr.data.foreach_get('value', old)
    attr.data.foreach_set('value', old | flags)
    log(f'mouth rim: {int(flags.sum())} faces')


def smile(body):
    """Lifts the corners of the mouth into a slight smile with the map `smile` of redits.py (the
    values in params.json `smile`). The step comes after the weights, so the automatic weights of
    the body stay those of the mesh with no smile, and no arm moves."""
    rule = P.get('smile')
    if not rule:
        return
    me = body.data
    S = studio_points(me)
    roots = part_roots(me)
    count = np.bincount(roots)
    part = np.where(count[roots] < 100, roots, -1)
    T = ce.smile(S, rule, dict(P, _part=part))
    set_studio_points(me, T)
    move = np.linalg.norm(T - S, axis=1)
    log(
        f'smile: {int((move > 1e-6).sum())} vertices move, {int(((move > 1e-6) & (part >= 0)).sum())} of loose parts, '
        f'largest {move.max():.4f}, lowest moved y {S[move > 1e-6, 1].min():.4f}'
    )


def facts(rig):
    for name, value in CONFIG['body'].items():
        rig[name] = value
    shoulder = CONFIG['joints']['upper_arm_L']['head'][1]
    rig['height'] = round(shoulder * CONFIG['metersPerUnit'], 6)
    for name, value in P.get('rigFacts', {}).items():
        rig[name] = value
    log(
        'facts',
        {k: rig[k] for k in list(CONFIG['body']) + ['height'] + list(P.get('rigFacts', {}))},
    )


def main():
    rest = sys.argv[sys.argv.index('--') + 1 :]
    out = os.path.abspath(rest[rest.index('--out') + 1])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    body = rimport.import_source_body(os.path.join(ROOT, CONFIG['source']), CONFIG['weld'])
    body.data.polygons.foreach_set('use_smooth', [False] * len(body.data.polygons))
    log('import', len(body.data.vertices), 'vertices', len(body.data.polygons), 'faces')
    subdivide(body)
    fold_relax(body)
    turn_paws(body)
    point_edits(body)
    counts = sa.add_surface(body, 'badger', CONFIG['texture'], eye_fans=False, config=CONFIG)
    log('surface', counts)
    eyes = own_eyes(body)
    round_balls(body, eyes)
    color_map(body, eyes)
    rm = sa.rig_mesh_lib()
    rm['BONES'] = sa.config_bones(rm, CONFIG)
    rig = build_rig(rm)
    gloss = {v for p in body.data.polygons if p.material_index == 1 for v in p.vertices}
    head_ids = sorted(gloss | set(loose_vertices(body.data)) | set(eyes))
    auto_weights(body, rig, set(head_ids))
    paw_size(body)
    exact_rows(body, rig, set(head_ids))
    if P.get('tailRows'):
        tail_rows(body, rig)
    if 'tailRule' in P:
        tail_rows_body(body, rig)
    thicken_trunk(body)
    if 'tailLay' in P:
        tail_rows(body, rig)
    ear_rows(body)
    smile(body)
    if P.get('smooth'):
        region_colors(body)
        relax(body)
    nose_trim(body)
    band_uvs(body)
    lower_lids(body)
    lids(body)
    mouth_rim(body)
    belly_key(body, rig)
    if 'tailLay' in P:
        tail_key(body, rig)
    if P.get('noseFur'):
        # The nose takes the color map of the source, with its painted nostrils, and the smooth
        # normals of the fur. The flat gloss faces in one dark color showed flat facets and no
        # nostrils. The step comes last, so that the weights and the other steps do not change.
        fur = [p for p in body.data.polygons if p.material_index == 1]
        for p in fur:
            p.material_index = 0
        log(f'nose: {len(fur)} gloss faces go to fur')
        if 'headShift' in P:
            # The nose now counts in the head box of `pnpm studio-body`, which moves the head
            # center of the holds forward. The shift keeps the head center of the gloss nose, so
            # that no hold moves.
            rig['headShift'] = P['headShift']
            log('head shift', P['headShift'])
    facts(rig)
    body.name, rig.name = 'badger', 'badger_rig'
    body.data.name, rig.data.name = 'badger', 'badger_rig'
    bpy.data.orphans_purge(do_recursive=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=out)
    with open(os.path.join(OUT, 'build.log'), 'w') as f:
        f.write('\n'.join(LOG) + '\n')
    log('wrote', out)


if __name__ == '__main__':
    main()
