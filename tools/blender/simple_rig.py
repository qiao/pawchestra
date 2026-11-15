"""Rigs a source mesh into the `.blend` of a studio body by the simple route: no cut, no cap, no
remesh, and no rebuild of the arms. The only edits of the mesh are a plain stretch of the limbs
and new rings on the quads of the arms, which keep the form of the surface.

    blender -b --factory-startup --python tools/blender/simple_rig.py -- <config.json> \
        --out <dir>/<animal>.blend [--smooth <passes>]

Then `pnpm rig-export <animal> --blend <dir>/<animal>.blend --out <dir>/<animal>.rig.glb` writes
the GLB file of the body, and `pnpm studio-body <animal>` writes its module.

The steps:
 1. Import the source mesh (a GLB file, or an FBX file that keeps its quads), weld its vertices,
    and make each face flat. With `joinQuads` in the config, join each two triangles of a quad of a
    GLB source into the quad again (`join_quads()`), because a GLB file holds only triangles. The
    join is a guess: two source triangles in a row can join too.
 2. Give each face the color of the texture (`texture` of the config, or the texture of a GLB
    source), and make the nose gloss (`add_surface()`).
 3. With `limbs` in the config, make the limbs longer along their bones (`limb_moves()`), and
    move the joints with them. With `rings`, add a ring halfway between each two rings of each
    arm: split each edge of the quad edge ring between them at its middle (`subdivide_rings()`).
 4. Add the armature of the app at the joints of the config, in the T-pose of the mesh, with the
    Action `bind` of the seat rules of the config (`build_armature()`).
 5. Give the weights by bone heat (Automatic Weights). The arm segments and the helpers take
    their weights by the same bone heat. Then smooth the weights over the mesh edges in a few
    Laplacian passes, keep the 4 largest weights of each vertex, and normalize them. Each loose
    part of the mesh other than the largest, such as an eyeball or a whisker of the face, takes
    the head bone alone (`loose_parts()`): bone heat gives a loose part no sure weights. With
    `rollSplit` in the config, the 4 roll segments of each upper arm and forearm share the weight
    of their arm part by the place of the vertex along the bone (`roll_split()`).
 6. Put a bead eye on each old eye, write the facts of the body, and save the file.
"""

import json
import os
import sys

import bmesh
import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import studio_armature as sa  # noqa: E402
import studio_eyes as se  # noqa: E402

#: The weight smooth of the test rig: the number of passes, and the share of the mean of the
#: neighbors that each pass gives a vertex.
SMOOTH_PASSES, SMOOTH_SHARE = 3, 0.5

#: The smallest weight that a vertex keeps after the smooth.
SMALLEST = 1e-3


def smoothstep(x, low, high):
    """Gives 0 below `low`, 1 above `high`, and a smooth step between them."""
    t = np.clip((np.asarray(x, float) - low) / (high - low), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def arm_axis(config, sign):
    """Gives the shoulder joint, the unit direction to the wrist joint, and the length to it of the
    arm of one side (sign 1 for the left side, -1 for the right side), in the studio axes."""
    mirror = np.array([sign, 1.0, 1.0])
    shoulder = np.array(config['joints']['upper_arm_L']['head']) * mirror
    wrist = np.array(config['joints']['hand_L']['head']) * mirror
    length = float(np.linalg.norm(wrist - shoulder))
    return shoulder, (wrist - shoulder) / length, length


def limb_moves(points, config):
    """Moves points (studio axes, n x 3) by the stretch of the limbs (`limbs` of the config).

    Each arm grows by `arm` along the line from the shoulder joint to the wrist joint, and the paw
    beyond the wrist moves with the wrist and keeps its size. Only a point near the line moves
    (`armRadius`: the share falls from 1 to 0 between the two distances), and the share grows from
    0 at the shoulder plane over `armRoot` units, so that the trunk and the root keep their form.
    The legs grow by `leg` in the height band from the ankle joint to the hip joint, the feet keep
    their size, and the body above the hips rises, so that the soles stay on the floor. The band
    starts and ends with a smooth ramp of `legRamp` units. A `leg` of two factors [shin, thigh]
    changes the band below the knee joint and the band above it by different factors, with a
    smooth ramp at the knee. A factor below 1 makes a leg shorter."""
    rule = config['limbs']
    out = np.array(points, float)
    for sign in (1.0, -1.0):
        shoulder, along, length = arm_axis(config, sign)
        t = (points - shoulder) @ along
        r = np.linalg.norm(points - shoulder - np.outer(t, along), axis=1)
        share = smoothstep(t, 0.0, rule['armRoot']) * (1 - smoothstep(r, *rule['armRadius']))
        out += np.outer((rule['arm'] - 1) * np.clip(t, 0.0, length) * share, along)

    ankle = config['joints']['foot_L']['head'][1]
    hip = config['joints']['thigh_L']['head'][1]
    ramp = rule['legRamp']
    knee = config['joints']['shin_L']['head'][1]
    shin, thigh = rule['leg'] if isinstance(rule['leg'], list) else (rule['leg'], rule['leg'])
    grid = np.linspace(-0.1, 1.5, 3201)
    factor = shin + (thigh - shin) * smoothstep(grid, knee - ramp, knee + ramp)
    rate = (factor - 1) * smoothstep(grid, ankle - ramp, ankle + ramp)
    rate *= 1 - smoothstep(grid, hip - ramp, hip + ramp)
    rise = np.concatenate([[0.0], np.cumsum((rate[1:] + rate[:-1]) / 2 * np.diff(grid))])
    out[:, 1] += np.interp(points[:, 1], grid, rise)
    return out


def stretch_limbs(body, config, eyes):
    """Stretches the limbs of the mesh, the joints of the config, and the old eyes (Blender axes)
    by `limb_moves()`. Gives the config with the moved joints and the moved eyes."""
    me = body.data
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    moved = limb_moves(co.reshape(-1, 3) @ sa.TO_STUDIO.T, config) @ sa.TO_STUDIO
    me.vertices.foreach_set('co', moved.ravel())
    me.update()

    joints = json.loads(json.dumps(config['joints']))
    for spec in joints.values():
        for key in ('head', 'tail'):
            if isinstance(spec.get(key), list):
                spec[key] = limb_moves(np.array([spec[key]], float), config)[0].tolist()
    eyes = {
        side: (limb_moves((middle @ sa.TO_STUDIO.T)[None], config)[0] @ sa.TO_STUDIO, facing)
        for side, (middle, facing) in eyes.items()
    }
    return {**config, 'joints': joints}, eyes


def edge_ring(start, faces_ok):
    """Walks the edge ring of an edge over quads: from each quad to the edge across it. Gives the
    edges of the ring when it closes around the arm over quads of `faces_ok` alone, else `None`
    (a triangle, a pole, or a face off the arm stops it)."""
    ring, edge, face = [start], start, None
    face = next((f for f in start.link_faces if f in faces_ok), None)
    while face is not None:
        if len(face.verts) != 4:
            return None
        across = [e for e in face.edges if not set(e.verts) & set(edge.verts)]
        if len(across) != 1:
            return None
        edge = across[0]
        if edge is start:
            return ring
        if len(edge.link_faces) != 2:
            return None
        ring.append(edge)
        face = next(f for f in edge.link_faces if f is not face)
        if face not in faces_ok or len(ring) > 64:
            return None
    return None


def subdivide_rings(body, config):
    """Adds a ring of vertices halfway between each two neighboring rings of each arm: it splits
    each edge of the quad edge ring that runs along the arm between the two rings at its middle
    (`bmesh.ops.subdivide_edges()`), so that each new ring follows the quads of the mesh and the
    surface keeps its form. A ring of the mesh is a group of at least `ringVerts` vertices of the
    arm (within `armRadius` of the line from the shoulder joint to the wrist joint) whose places
    along the line lie within `ringGap` units of the next. Only the rings between the shares
    `subdivide` of the line take a new ring between them, so that the arm root at the trunk and
    the paw keep their faces, and two rings less than `minGap` units apart take none. An edge ring
    that does not close around the arm over quads, at a triangle or a pole, takes no split. Gives
    the count of the new rings and the places of the skipped ones."""
    rule = config['rings']
    low, high = rule['subdivide']
    bm = bmesh.new()
    bm.from_mesh(body.data)
    added, skipped = 0, []
    for sign in (1.0, -1.0):
        shoulder, along, length = arm_axis(config, sign)
        co = np.array([v.co[:] for v in bm.verts]) @ sa.TO_STUDIO.T
        t = (co - shoulder) @ along
        r = np.linalg.norm(co - shoulder - np.outer(t, along), axis=1)
        arm = (r < rule['armRadius']) & (t > 0)
        found = np.sort(t[arm & (t > low * length) & (t < high * length)])
        groups = [[found[0]]]
        for x in found[1:]:
            if x - groups[-1][-1] < rule['ringGap']:
                groups[-1].append(x)
            else:
                groups.append([x])
        rings = [float(np.mean(g)) for g in groups if len(g) >= rule['ringVerts']]
        faces_ok = {f for f in bm.faces if all(arm[v.index] for v in f.verts)}
        rings_to_split = []
        for a, b in zip(rings, rings[1:]):
            if b - a < rule['minGap']:
                continue
            # The edges along the arm that cross the middle plane between the two rings.
            middle = (a + b) / 2
            starts = [
                e
                for e in bm.edges
                if all(arm[v.index] for v in e.verts)
                and (t[e.verts[0].index] - middle) * (t[e.verts[1].index] - middle) < 0
            ]
            ring = edge_ring(starts[0], faces_ok) if starts else None
            if ring is None or len(ring) != len(starts) or set(ring) != set(starts):
                skipped.append(round(middle / length, 3) * sign)
                continue
            rings_to_split.append(ring)
        for ring in rings_to_split:
            bmesh.ops.subdivide_edges(bm, edges=ring, cuts=1, use_grid_fill=True)
            added += 1
        bm.verts.index_update()
        bm.edges.index_update()
        bm.faces.index_update()
    bm.to_mesh(body.data)
    bm.free()
    body.data.update()
    return added, skipped


def roll_split(w, names, co, rig):
    """Splits the weight of each arm part among its roll segments by the place of the vertex along
    the bone, in place. Bone heat gives each segment its weights by distance, so the roll gathers
    in bands at the borders of the segments, and the faces there twist into a spiral. For each
    vertex, the total weight on the 4 segments of the upper arm (or of the forearm) stays. The
    place t along the bone goes from 0 at the joint at the start of the part to 1 at the joint at
    its end. Segment k takes the share (k + 0.5) / 4 of the roll (`segment_share()` of
    `rig_mesh.py`), so the total goes to the two segments around t with a linear ramp, and the
    vertex takes the roll of its place: t of the roll from 1/8 to 7/8, the first segment below,
    and the last segment above. The helpers of the elbow and the wrist keep their weights."""
    count = 4
    for side in 'LR':
        for part, end in (('upper_arm', 'forearm'), ('forearm', 'hand')):
            head = np.array(rig.data.bones[f'{part}_{side}'].head_local)
            axis = np.array(rig.data.bones[f'{end}_{side}'].head_local) - head
            length = np.linalg.norm(axis)
            cols = [names.index(f'{part}_seg{k}_{side}') for k in range(count)]
            total = w[:, cols].sum(axis=1)
            t = np.clip((co - head) @ axis / length**2, 0.0, 1.0)
            place = np.clip(t * count - 0.5, 0.0, count - 1.0)
            low = np.minimum(np.floor(place).astype(int), count - 2)
            ramp = place - low
            split = np.zeros((len(w), count))
            rows = np.arange(len(w))
            split[rows, low] = total * (1 - ramp)
            split[rows, low + 1] += total * ramp
            w[:, cols] = split


def smooth_weights(body, passes, share, rig=None):
    """Smooths the bone weights over the mesh edges, then keeps the 4 largest weights of each
    vertex and normalizes them. Bone heat gives a sharp step where the T-pose arm meets the chest,
    and the smooth spreads it over a few rings of vertices. With an armature `rig`, the roll
    segments then share the weight of their arm part by the place along the bone
    (`roll_split()`)."""
    me = body.data
    n, groups = len(me.vertices), list(body.vertex_groups)
    w = np.zeros((n, len(groups)))
    for v in me.vertices:
        for g in v.groups:
            w[v.index, g.group] = g.weight
    edges = np.empty(len(me.edges) * 2, int)
    me.edges.foreach_get('vertices', edges)
    a, b = edges.reshape(-1, 2).T
    count = np.bincount(np.concatenate([a, b]), minlength=n).astype(float)
    for _ in range(passes):
        total = np.zeros_like(w)
        np.add.at(total, a, w[b])
        np.add.at(total, b, w[a])
        mean = np.divide(total, count[:, None], out=w.copy(), where=count[:, None] > 0)
        w = w * (1 - share) + mean * share
    if rig is not None:
        co = np.empty(n * 3)
        me.vertices.foreach_get('co', co)
        roll_split(w, [g.name for g in groups], co.reshape(-1, 3), rig)

    # The 4 largest weights of each vertex, each at least SMALLEST, with a sum of 1.
    order = np.argsort(-w, axis=1)
    w[np.arange(n)[:, None], order[:, sa.INFLUENCES :]] = 0.0
    w[w < SMALLEST] = 0.0
    # A vertex with no weight, such as a vertex of a loose part, keeps none.
    w /= np.maximum(w.sum(axis=1, keepdims=True), SMALLEST)
    for k, group in enumerate(groups):
        group.remove(range(n))
        for i in np.nonzero(w[:, k])[0]:
            group.add([int(i)], float(w[i, k]), 'REPLACE')


def join_quads(bm):
    """Joins each two triangles that follow one another in the face order and share an edge into
    one quad (`bmesh.utils.face_join()`). The glTF exporter writes the two triangles of a quad one
    after the other. Gives the number of quads."""
    bm.faces.ensure_lookup_table()
    faces = list(bm.faces)
    pairs, k = [], 0
    while k + 1 < len(faces):
        f, g = faces[k], faces[k + 1]
        shared = set(f.verts) & set(g.verts)
        if len(f.verts) == 3 and len(g.verts) == 3 and len(shared) == 2:
            pairs.append((f, g))
            k += 2
        else:
            k += 1
    for f, g in pairs:
        bmesh.utils.face_join([f, g])
    return len(pairs)


def join_source_quads(body):
    """Joins each two triangles of a quad of the source into the quad again. Gives the number of
    quads."""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    quads = join_quads(bm)
    bm.to_mesh(body.data)
    bm.free()
    body.data.update()
    return quads


def loose_parts(body):
    """Gives the vertices of each loose part of the mesh other than the largest part."""
    me = body.data
    edges = np.empty(len(me.edges) * 2, int)
    me.edges.foreach_get('vertices', edges)
    part = np.arange(len(me.vertices))

    def find(i):
        while part[i] != i:
            part[i] = part[part[i]]
            i = part[i]
        return i

    for a, b in edges.reshape(-1, 2):
        ra, rb = find(a), find(b)
        if ra != rb:
            part[max(ra, rb)] = min(ra, rb)
    roots = np.array([find(i) for i in range(len(part))])
    largest = np.bincount(roots).argmax()
    return np.nonzero(roots != largest)[0].tolist()


def tone_faces(body, rm, rule):
    """Moves the plain fur toward the color of the sheet (`colors.tone` of the config, `tone()` of
    `rig_mesh.py`), as the rig of the T-pose rabbit did."""
    me = body.data
    for name in ('color', 'color_base'):
        rgba = np.empty(len(me.polygons) * 4, np.float32)
        me.attributes[name].data.foreach_get('color', rgba)
        rgba = rgba.reshape(-1, 4)
        srgb = np.clip(rgba[:, :3], 0, 1)
        srgb = np.where(srgb <= 0.0031308, srgb * 12.92, 1.055 * srgb ** (1 / 2.4) - 0.055)
        moved, _ = rm['tone'](srgb, np.zeros(len(srgb), int), rule)
        rgba[:, :3] = rm['linear'](moved)
        me.attributes[name].data.foreach_set('color', rgba.ravel())


def old_eyes(body, config, rm):
    """Gives the middle (the front of the dome) and the facing of each old eye of the source, by
    side, in Blender axes of the rest: the dark faces in the eye box (`features()` of
    `rig_mesh.py`)."""
    me = body.data
    me.calc_loop_triangles()
    tris = np.array([t.vertices[:] for t in me.loop_triangles])
    owner = np.array([t.polygon_index for t in me.loop_triangles])
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    texture = sa.base_texture(os.path.join(sa.ROOT, config.get('texture', config['source'])))
    rgb, dark = sa.polygon_colors(me, texture, config['colors'], rm)
    eyes, _ = rm['features'](co @ sa.TO_STUDIO.T, tris, rgb[owner], dark[owner], config['colors'])
    out = {}
    for side, faces in eyes.items():
        corners = co[tris[faces]]
        normal = np.cross(corners[:, 1] - corners[:, 0], corners[:, 2] - corners[:, 0]).sum(axis=0)
        facing = normal / np.linalg.norm(normal)
        points = corners.reshape(-1, 3)
        middle = points.mean(axis=0)
        out[side] = (middle + facing * ((points - middle) @ facing).max(), facing)
    return out


def main():
    """Builds the `.blend` of the config of the arguments."""
    rest = sys.argv[sys.argv.index('--') + 1 :]
    with open(rest[0]) as f:
        config = json.load(f)
    out = os.path.abspath(rest[rest.index('--out') + 1])
    passes = int(rest[rest.index('--smooth') + 1]) if '--smooth' in rest else SMOOTH_PASSES
    rm = sa.rig_mesh_lib()
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # 1. The source mesh, welded, with flat faces.
    body = sa.import_source(os.path.join(sa.ROOT, config['source']), config['weld'])
    quads = join_source_quads(body) if config.get('joinQuads') else 0
    body.data.polygons.foreach_set('use_smooth', [False] * len(body.data.polygons))
    eyes = old_eyes(body, config, rm)

    # 2. The face colors and the gloss nose.
    animal = os.path.splitext(os.path.basename(out))[0]
    texture = config.get('texture', config['source'])
    counts = sa.add_surface(body, animal, texture, eye_fans=False, config=config)
    tone_faces(body, rm, config['colors']['tone'])

    # 3. The longer limbs and the joint rings.
    body.data.calc_loop_triangles()
    triangles = len(body.data.loop_triangles)
    if 'limbs' in config:
        config, eyes = stretch_limbs(body, config, eyes)
    cuts, skipped = 0, []
    if 'subdivide' in config.get('rings', {}):
        cuts, skipped = subdivide_rings(body, config)
    body.data.calc_loop_triangles()
    added = len(body.data.loop_triangles) - triangles

    # 4. The armature in the T-pose of the mesh, and the seated bind.
    rm['BONES'] = sa.config_bones(rm, config)
    rig = sa.build_armature(config, rm)

    # 5. Bone heat, then the smooth of the weights.
    empty = sa.skin_mesh(body, rig, auto=True)
    smooth_weights(body, passes, SMOOTH_SHARE, rig if config.get('rollSplit') else None)
    gloss = {v for p in body.data.polygons if p.material_index == 1 for v in p.vertices}
    loose = loose_parts(body)
    on_head = sorted(gloss | set(loose))
    for group in body.vertex_groups:
        group.remove(on_head)
    body.vertex_groups['head'].add(on_head, 1.0, 'REPLACE')

    # 6. The eyes in the bind, the facts of the body, and the file.
    head = sa.action_worlds(rig, bpy.data.actions['bind'])['head']
    rest_head = sa.m64(rig.data.bones['head'].matrix_local)
    move = head @ np.linalg.inv(rest_head)
    se.place_eyes(
        rig,
        body,
        {
            side: (move[:3, :3] @ middle + move[:3, 3], move[:3, :3] @ facing, config['eyeSize'])
            for side, (middle, facing) in eyes.items()
        },
    )
    for name, value in config['body'].items():
        rig[name] = value
    if 'metersPerUnit' in config:
        shoulder = config['joints']['upper_arm_L']['head'][1]
        rig['height'] = round(shoulder * config['metersPerUnit'], 6)
    body.name, rig.name = animal, f'{animal}_rig'
    bpy.data.orphans_purge(do_recursive=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=out)
    print(
        f'simple_rig: wrote {out}: {counts}, {quads} joined quads, {len(rig.data.bones)} bones, '
        f'{empty} vertices with no bone heat, {len(loose)} vertices of loose parts on the head, '
        f'{passes} smooth passes, {cuts} new arm rings that add {added} triangles, skipped edge '
        f'rings at the arm shares {skipped}',
        flush=True,
    )


if __name__ == '__main__':
    main()
