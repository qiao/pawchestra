"""Builds the test mannequin of the rig chain and of the Mixamo route (design 4.4, "Test mannequin").

    blender -b --factory-startup --python tools/blender/mannequin.py -- <human|animal> --out <dir>

The script writes these files into `<dir>`. Two runs give the same bytes.

- `mannequin-<preset>.glb`: the mesh with no skeleton in an A-pose, with a gap under each arm
  (design 4.4, "Intake pose"). It is the input of `pnpm rig-mesh mannequin`.
- `mannequin-<preset>-tpose.fbx`: the mesh with no skeleton in a T-pose, for an upload to
  mixamo.com.
- `mannequin-<preset>-mixamo.glb` and `mannequin-<preset>-mixamo.fbx`: the T-pose mesh with a
  skeleton that copies the skeleton of a Mixamo file (`mixamo_bones()`), weights of at most 4 bones,
  and the test clips (`CLIPS`).

The steps:

1. Make the body from a graph of points with the Skin modifier, then two levels of the
   Subdivision Surface modifier. Each point of the graph gives one quad ring of 16 vertices, so
   each joint has its rings (`skin_graph()`). The script makes each point itself: the face order
   of `bmesh.ops.create_uvsphere()` changes from run to run (`docs/agents/rigging.md`).
2. Give each face one color of the palette (`face_color()`): the markers of the twist and of the
   side, the palm, the thumb, and the face. A palette texture holds the colors, and each face
   takes the UV of the middle of its color cell (`palette_png()`).
3. Add the Mixamo skeleton in the T-pose, parent with automatic weights, and run Limit Total 4
   and Normalize All. Then turn each bone up with no roll, so that each joint has no turn in the
   rest pose, as in a Mixamo file (`mixamo_rig()`).
4. Key the test clips at 30 frames per second (`add_clips()`).
5. Pose the arms 40 degrees down from the T-pose and apply the skin to the mesh: this is the
   A-pose mesh (`a_pose_mesh()`).
6. Write the files. The FBX files are in centimeters, as a Mixamo download (`write_fbx()`).

Blender gives each Python process a random seed of the string hash, and the FBX exporter makes
its ids from that hash. The script thus runs itself again with `PYTHONHASHSEED=0` (`main()`).

In the live Blender of MCP, `build(preset, work)` makes the scene of one preset with no file.
"""

import datetime
import hashlib
import math
import os
import struct
import subprocess
import sys
import zlib

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector

#: The frames for each second of the clips.
FPS = 30

#: The levels of the Subdivision Surface modifier. The Skin modifier gives a ring of 4 vertices at
#: each point of the graph, and two levels give 16 vertices, as the arm tubes of
#: `docs/agents/rigging.md` ("The rebuild of the arms in Blender").
SUBDIVISIONS = 2

#: The factor of each radius of the Skin modifier. The subdivision pulls the corners of each ring
#: of 4 vertices in, so the radii of the presets are the radii of the subdivided body.
SKIN_GROW = 1.3

#: The size of one color cell of the palette texture, in pixels.
CELL = 8

#: The palette, in sRGB. Each face takes one color (`face_color()`). The left side and the right
#: side of the plain skin have a small tint difference, so that a mirrored side shows.
PALETTE = {
    'skin_L': (0.86, 0.80, 0.70),
    'skin_R': (0.74, 0.80, 0.86),
    'upper_arm': (0.85, 0.15, 0.12),
    'upper_arm_back': (0.42, 0.07, 0.06),
    'forearm': (0.95, 0.75, 0.10),
    'forearm_back': (0.48, 0.37, 0.05),
    'thigh': (0.15, 0.35, 0.90),
    'thigh_back': (0.07, 0.17, 0.45),
    'shin': (0.15, 0.70, 0.25),
    'shin_back': (0.07, 0.35, 0.12),
    'palm': (0.85, 0.25, 0.65),
    'hand_back': (0.96, 0.96, 0.94),
    'thumb': (0.10, 0.75, 0.80),
    'eye': (0.02, 0.02, 0.02),
    'nose': (0.90, 0.35, 0.10),
    'sole': (0.35, 0.33, 0.32),
}

#: The order of the palette colors in the texture, 4 cells for each row.
COLOR_ORDER = tuple(PALETTE)


# Each preset gives its places in H, the height from the soles to the top of the head, in the axes
# of the studio: y up, +z forward, and +x the left side. The right side mirrors the left side.


def human_preset():
    """Gives the human preset: an adult of 1.8 m, as the Mixamo characters.

    The heights and the segment lengths are those of Winter, "Biomechanics and Motor Control of
    Human Movement", 4th ed., 2009, figure 4.1 (after Drillis and Contini, 1966): the chin
    0.870 H, the chest 0.720 H, the hip (greater trochanter) 0.530 H, the knee 0.285 H, the ankle
    0.039 H, the upper arm 0.186 H, the forearm 0.146 H, the hand 0.108 H, the hip width
    0.191 H, and the foot length 0.152 H. The hip joints lie 0.05 H out, about half of the half
    hip width. The shoulder joint (0.09 H out, 0.81 H high) lies under
    the acromion (0.818 H high, half of the shoulder width 0.259 H out), as `mixamorig:LeftArm`
    of `Xbot.glb` of the three.js examples (0.085 H out, 0.810 H high). The radii are chosen.
    """
    shoulder = (0.09, 0.81, 0.0)
    return {
        'name': 'human',
        'height': 1.8,
        'shoulder': shoulder,
        'arm': (0.186, 0.146, 0.108),
        'hip': (0.05, 0.53, 0.0),
        'knee': (0.05, 0.285, 0.0),
        'ankle': (0.05, 0.039, -0.005),
        'heel': (0.05, 0.02, -0.035),
        'ball': (0.05, 0.02, 0.075),
        'toe': (0.05, 0.02, 0.112),
        'trunk': (
            # Height, half width, half depth, forward shift.
            (0.555, 0.085, 0.055, 0.0),
            (0.63, 0.075, 0.05, 0.0),
            (0.72, 0.09, 0.058, 0.0),
            (0.79, 0.085, 0.052, 0.0),
        ),
        'neck': ((0.83, 0.025, 0.025, 0.0), (0.865, 0.024, 0.024, 0.005)),
        'head': (
            (0.89, 0.048, 0.06, 0.01),
            (0.945, 0.055, 0.068, 0.008),
            (1.005, 0.035, 0.045, 0.0),
        ),
        'limb': {
            # Radii at the shoulder, the elbow, the wrist, the hip, the knee, and the ankle.
            'shoulder': 0.032,
            'elbow': 0.024,
            'wrist': 0.019,
            'hip': 0.05,
            'knee': 0.032,
            'ankle': 0.022,
        },
        'hand': {'width': 0.03, 'thick': 0.012},
        'foot': {'width': 0.024, 'thick': 0.018},
        'face': {'eye': (0.7, -0.15), 'eyeSize': 0.22, 'nose': (0.0, -0.5), 'noseSize': 0.2},
    }


def animal_preset():
    """Gives the animal preset: the proportions of the animals of the app, 1.6 m high.

    Each place is the mean of the wolf and the rabbit, in parts of the height from the soles to the
    skull top. The wolf joints are those of `tools/mesh-rigs/wolf.json`, with the skull top at
    0.8684 u (`app.note`). The rabbit joints are those of the A-pose rabbit
    (`tools/mesh-rigs/rabbit.json` at 6af3369d) after the leg factor 1.75, which lifts the body
    0.09 u (the shoulders at 0.574 u, `app.note`), with the skull top at the tail of the head bone,
    0.85 u. The parts (wolf, rabbit, mean):

    - shoulder joint height 0.6005, 0.675, 0.638; out 0.1107, 0.107, 0.109
    - hip joint height 0.293, 0.300, 0.297; out 0.0872, 0.082, 0.085
    - knee 0.176, 0.166, 0.171; ankle 0.0537, 0.053, 0.0535
    - neck joint 0.6835, 0.718, 0.701; head joint 0.7639, 0.776, 0.770
    - upper arm 0.1376, 0.134, 0.136; forearm 0.1297, 0.138, 0.134; paw 0.0869, 0.066, 0.077

    The height 1.6 m is the standing skull top of the wolf in the app (1.620 m, `app.note` of
    `wolf.json`). The radii are chosen: a big round head, a deep trunk, and short thick limbs.
    """
    shoulder = (0.109, 0.638, 0.0)
    return {
        'name': 'animal',
        'height': 1.6,
        'shoulder': shoulder,
        'arm': (0.136, 0.134, 0.077),
        'hip': (0.085, 0.297, 0.0),
        'knee': (0.085, 0.171, 0.0),
        'ankle': (0.085, 0.0535, -0.005),
        'heel': (0.085, 0.025, -0.035),
        'ball': (0.085, 0.025, 0.06),
        'toe': (0.085, 0.025, 0.095),
        'trunk': (
            (0.31, 0.13, 0.095, 0.0),
            (0.42, 0.12, 0.09, 0.005),
            (0.53, 0.125, 0.09, 0.01),
            (0.625, 0.11, 0.075, 0.01),
        ),
        'neck': ((0.68, 0.05, 0.05, 0.015), (0.73, 0.055, 0.055, 0.02)),
        'head': (
            (0.77, 0.10, 0.11, 0.03),
            (0.87, 0.115, 0.12, 0.03),
            (1.005, 0.07, 0.075, 0.02),
        ),
        'limb': {
            'shoulder': 0.042,
            'elbow': 0.034,
            'wrist': 0.03,
            'hip': 0.07,
            'knee': 0.05,
            'ankle': 0.04,
        },
        'hand': {'width': 0.05, 'thick': 0.024},
        'foot': {'width': 0.04, 'thick': 0.028},
        'face': {'eye': (0.7, 0.02), 'eyeSize': 0.25, 'nose': (0.0, -0.35), 'noseSize': 0.2},
    }


PRESETS = {'human': human_preset, 'animal': animal_preset}


def scaled(p, v):
    """Gives a place of the preset in meters."""
    return Vector(v) * p['height']


def to_blender(v):
    """Gives a place of the studio axes (y up, +z forward) in the axes of Blender (z up, -y
    forward)."""
    return Vector((v[0], -v[2], v[1]))


def mirror(v):
    """Gives the place on the other side."""
    return Vector((-v[0], v[1], v[2]))


def landmarks(p):
    """Gives the places of the left side and of the middle in meters (studio axes, T-pose): the arm
    joints along +x, the thumb, the leg joints, the foot, and the head."""
    h = p['height']
    s = scaled(p, p['shoulder'])
    upper, fore, hand = (a * h for a in p['arm'])
    w = s + Vector((upper + fore, 0, 0))
    t = s + Vector((upper + fore + hand, 0, 0))
    thumb_base = w.lerp(t, 0.12)
    # The thumb points forward and out from the base of the palm, a little down.
    thumb_tip = thumb_base + Vector((0.25, -0.05, 0.55)).normalized() * hand * 0.7
    trunk, neck, head = p['trunk'], p['neck'], p['head']
    return {
        'shoulder': s,
        'elbow': s + Vector((upper, 0, 0)),
        'wrist': w,
        'palm': w.lerp(t, 0.45),
        'tip': t,
        'thumb_base': thumb_base,
        'thumb_tip': thumb_tip,
        'hip': scaled(p, p['hip']),
        'knee': scaled(p, p['knee']),
        'ankle': scaled(p, p['ankle']),
        'heel': scaled(p, p['heel']),
        'ball': scaled(p, p['ball']),
        'toe': scaled(p, p['toe']),
        'pelvis': Vector((0, trunk[0][0] * h, trunk[0][3] * h)),
        'neck': Vector((0, neck[0][0] * h, neck[0][3] * h)),
        'chin': Vector((0, neck[-1][0] * h, neck[-1][3] * h)),
        'head': Vector((0, head[1][0] * h, head[1][3] * h)),
        'top': Vector((0, h, head[-1][3] * h)),
    }


def skin_graph(p):
    """Gives the graph of the Skin modifier: the points in meters (studio axes), the radius of each
    point (across the bone, as two values of the Skin modifier), and the edges. The first point is
    the root, in the pelvis. The left side comes first, and the right side mirrors it."""
    points, radii, edges = [], [], []

    def add(v, r, parent=None):
        points.append(Vector(v))
        radii.append(r if isinstance(r, tuple) else (r, r))
        if parent is not None:
            edges.append((parent, len(points) - 1))
        return len(points) - 1

    h = p['height']
    trunk = [add((0, y * h, z * h), (wx * h, dz * h)) for y, wx, dz, z in p['trunk']]
    for a, b in zip(trunk, trunk[1:]):
        edges.append((a, b))
    last = trunk[-1]
    for y, wx, dz, z in p['neck'] + p['head']:
        last = add((0, y * h, z * h), (wx * h, dz * h), last)
    head_top = last

    limb = {k: v * h for k, v in p['limb'].items()}
    for sign in (1, -1):
        side = (lambda v: Vector(v)) if sign == 1 else mirror
        # The arm: the shoulder, a point on the upper arm, the elbow, a point on the forearm, the
        # wrist, then the palm and the tip of the hand. Two levels of subdivision give 17 rings
        # from the shoulder to the wrist.
        at = landmarks(p)
        s, e, w, t = at['shoulder'], at['elbow'], at['wrist'], at['tip']
        root = add(side(Vector((s.x * 0.5, s.y, s.z))), limb['shoulder'] * 1.15, trunk[-1])
        prev = add(side(s), limb['shoulder'], root)
        prev = add(side(s.lerp(e, 0.5)), (limb['shoulder'] + limb['elbow']) / 2, prev)
        prev = add(side(e), limb['elbow'], prev)
        prev = add(side(e.lerp(w, 0.5)), (limb['elbow'] + limb['wrist']) / 2, prev)
        wrist = add(side(w), limb['wrist'], prev)
        hand = p['hand']
        palm = add(side(at['palm']), (hand['width'] * h, hand['thick'] * h), wrist)
        add(side(t), (hand['width'] * h * 0.8, hand['thick'] * h * 0.8), palm)
        add(side(at['thumb_tip']), hand['thick'] * h * 0.8, palm)

        # The leg: the hip, a point on the thigh, the knee, a point on the shin, the ankle, and
        # the foot.
        hip, knee, ankle = at['hip'], at['knee'], at['ankle']
        prev = add(side(hip), limb['hip'], trunk[0])
        prev = add(side(hip.lerp(knee, 0.5)), (limb['hip'] + limb['knee']) / 2, prev)
        prev = add(side(knee), limb['knee'], prev)
        prev = add(side(knee.lerp(ankle, 0.5)), (limb['knee'] + limb['ankle']) / 2, prev)
        ankle_i = add(side(ankle), limb['ankle'], prev)
        foot = p['foot']
        fr = (foot['width'] * h, foot['thick'] * h)
        add(side(at['heel']), (fr[0] * 0.9, fr[1] * 0.9), ankle_i)
        ball = add(side(at['ball']), fr, ankle_i)
        add(side(at['toe']), (fr[0] * 0.9, fr[1] * 0.7), ball)
    return points, radii, edges, head_top


def connected_parts(bm):
    """Gives the number of the connected parts of a mesh."""
    seen = set()
    parts = 0
    for v in bm.verts:
        if v.index in seen:
            continue
        parts += 1
        stack = [v]
        while stack:
            x = stack.pop()
            if x.index not in seen:
                seen.add(x.index)
                stack.extend(e.other_vert(x) for e in x.link_edges)
    return parts


def body_object(p, name='Mannequin'):
    """Makes the body mesh of the T-pose: the Skin modifier on the graph, then the Subdivision
    Surface modifier, applied. Gives the mesh object, in meters."""
    points, radii, edges, _ = skin_graph(p)
    me = bpy.data.meshes.new(name + 'Graph')
    me.from_pydata([to_blender(v) for v in points], edges, [])
    ob = bpy.data.objects.new(name + 'Graph', me)
    bpy.context.scene.collection.objects.link(ob)
    skin = ob.modifiers.new('Skin', 'SKIN')
    skin.use_smooth_shade = False
    skin.branch_smoothing = 0.0
    sub = ob.modifiers.new('Subdivision', 'SUBSURF')
    sub.levels = SUBDIVISIONS
    sub.render_levels = SUBDIVISIONS
    layer = me.skin_vertices[0].data
    for i, r in enumerate(radii):
        layer[i].radius = (r[0] * SKIN_GROW, r[1] * SKIN_GROW)
        layer[i].use_root = i == 0
    depsgraph = bpy.context.evaluated_depsgraph_get()
    body = bpy.data.meshes.new_from_object(ob.evaluated_get(depsgraph))
    body.name = name
    bpy.data.objects.remove(ob)
    bpy.data.meshes.remove(me)
    # The hulls of the Skin modifier leave a few loose vertices at the branches.
    bm = bmesh.new()
    bm.from_mesh(body)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    # A hull of the Skin modifier can fail at a branch and leave a part on its own. The automatic
    # weights and the arm gate need one closed surface.
    bm.verts.index_update()
    parts = connected_parts(bm)
    bm.to_mesh(body)
    bm.free()
    if parts != 1:
        raise SystemExit(f'The body of {p["name"]} has {parts} parts, not 1.')
    out = bpy.data.objects.new(name, body)
    bpy.context.scene.collection.objects.link(out)
    return out


def limb_segments(at):
    """Gives the segments of the left limbs for the colors: the name, the start, the end, and the
    radius within which a face belongs to the segment, as a part of the length."""
    return (
        ('upper_arm', at['shoulder'], at['elbow']),
        ('forearm', at['elbow'], at['wrist']),
        ('hand', at['wrist'], at['tip']),
        ('thumb', at['thumb_base'], at['thumb_tip']),
        ('thigh', at['hip'], at['knee']),
        ('shin', at['knee'], at['ankle']),
        ('foot', at['heel'], at['toe']),
    )


def segment_place(c, a, b):
    """Gives the part along the segment from a to b of the point nearest to c, and the distance."""
    ab = b - a
    t = max(0.0, min(1.0, (c - a).dot(ab) / ab.length_squared))
    return t, (c - (a + ab * t)).length


#: The parts along each limb segment between which the band of the twist marker lies.
BAND = (0.42, 0.58)

#: The cosine of the half angle of the stripe of the twist marker on the front of each limb.
STRIPE = math.cos(math.radians(28))


def face_color(p, at, c):
    """Gives the palette name of the face with the middle c (studio axes, T-pose, meters).

    - Each upper arm, forearm, thigh, and shin has a band around its middle, in the color of the
      segment on the front half and in a dark color on the back half, and a stripe along its
      front. The front of each limb is +z in the T-pose, the side of the thumb on the arms. A
      twisted limb turns the stripe into a spiral and moves the edge of the two halves.
    - The palm (down in the T-pose) has a color unlike the back of the hand, and the thumb has
      its own color.
    - The face has two black eyes and a nose on the front of the head.
    - The plain skin has a small tint difference between the left side (+x) and the right side.
    """
    left = c.x >= 0
    m = c if left else mirror(c)
    if m.y > at['chin'].y + 0.01 * p['height']:
        d = (m - at['head']).normalized()
        face = p['face']
        eye = Vector((face['eye'][0], face['eye'][1], 1)).normalized()
        nose = Vector((face['nose'][0], face['nose'][1], 1)).normalized()
        if d.angle(eye) < face['eyeSize']:
            return 'eye'
        if d.angle(nose) < face['noseSize']:
            return 'nose'
    best = None
    for name, a, b in limb_segments(at):
        t, dist = segment_place(m, a, b)
        if best is None or dist < best[2]:
            best = (name, t, dist, a, b)
    name, t, dist, a, b = best
    limit = 2.2 * max(p['limb'].values()) * p['height']
    if dist < limit:
        axis = (b - a).normalized()
        radial = m - (a + (b - a) * t)
        radial = (radial - axis * radial.dot(axis)).normalized()
        if name in ('upper_arm', 'forearm', 'thigh', 'shin') and 0.15 < t < 0.85:
            front = radial.dot(Vector((0, 0, 1)))
            if BAND[0] <= t <= BAND[1]:
                return name if front >= 0 else name + '_back'
            if front > STRIPE:
                return name
        if name == 'hand' and t > 0.02:
            return 'palm' if radial.y < 0 else 'hand_back'
        if name == 'thumb' and t > 0.5 and dist < 1.6 * p['hand']['thick'] * p['height']:
            return 'thumb'
        if name == 'foot' and radial.y < -0.5:
            return 'sole'
    return 'skin_L' if left else 'skin_R'


def palette_png():
    """Gives the PNG bytes of the palette texture: 4 color cells of `CELL` pixels in each row, in
    the order of `COLOR_ORDER`."""
    cols = 4
    rows = (len(COLOR_ORDER) + cols - 1) // cols
    width, height = cols * CELL, rows * CELL
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for x in range(width):
            k = (y // CELL) * cols + x // CELL
            rgb = PALETTE[COLOR_ORDER[k]] if k < len(COLOR_ORDER) else (0.0, 0.0, 0.0)
            raw.extend(round(v * 255) for v in rgb)

    def chunk(kind, data):
        body = kind + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body))

    header = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', header)
        + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
        + chunk(b'IEND', b'')
    )


def cell_uv(name):
    """Gives the UV of the middle of the color cell of a palette name (Blender UV, v up)."""
    k = COLOR_ORDER.index(name)
    cols = 4
    rows = (len(COLOR_ORDER) + cols - 1) // cols
    return ((k % cols + 0.5) / cols, 1 - (k // cols + 0.5) / rows)


def paint(p, ob, work):
    """Gives each face of the body its palette color: a UV at the middle of its color cell, and the
    material with the palette texture. Gives the number of faces of each color."""
    at = landmarks(p)
    me = ob.data
    uv = me.uv_layers.new(name='UVMap')
    counts = {}
    for f in me.polygons:
        c = Vector((f.center.x, f.center.z, -f.center.y))
        name = face_color(p, at, c)
        counts[name] = counts.get(name, 0) + 1
        u = cell_uv(name)
        for li in f.loop_indices:
            uv.data[li].uv = u
    path = os.path.join(work, 'mannequin-palette.png')
    with open(path, 'wb') as f:
        f.write(palette_png())
    image = bpy.data.images.load(path)
    image.name = 'mannequin-palette'
    image.pack()
    mat = bpy.data.materials.new('mannequin')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = 0.8
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = image
    tex.interpolation = 'Closest'
    mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    me.materials.append(mat)
    return counts


#: The bones of the Mixamo skeleton with all fingers (65 bones), in parent order, with the prefix
#: `mixamorig:`. Each name is a bone of `Xbot.glb` and of `Samba Dancing.fbx` of the three.js
#: examples, which Mixamo exported. `Left` stands for each side. The bones that end a chain
#: (`HeadTop_End`, `Toe_End`, and the fourth bone of each finger) hold no weight.
MIXAMO_CENTER = (
    ('Hips', None),
    ('Spine', 'Hips'),
    ('Spine1', 'Spine'),
    ('Spine2', 'Spine1'),
    ('Neck', 'Spine2'),
    ('Head', 'Neck'),
    ('HeadTop_End', 'Head'),
)
MIXAMO_SIDE = (
    (
        ('LeftShoulder', 'Spine2'),
        ('LeftArm', 'LeftShoulder'),
        ('LeftForeArm', 'LeftArm'),
        ('LeftHand', 'LeftForeArm'),
    )
    + tuple(
        (f'LeftHand{finger}{k}', 'LeftHand' if k == 1 else f'LeftHand{finger}{k - 1}')
        for finger in ('Thumb', 'Index', 'Middle', 'Ring', 'Pinky')
        for k in (1, 2, 3, 4)
    )
    + (
        ('LeftUpLeg', 'Hips'),
        ('LeftLeg', 'LeftUpLeg'),
        ('LeftFoot', 'LeftLeg'),
        ('LeftToeBase', 'LeftFoot'),
        ('LeftToe_End', 'LeftToeBase'),
    )
)

#: The prefix of each bone name of a Mixamo skeleton.
PREFIX = 'mixamorig:'


def mixamo_bones():
    """Gives the 65 bones (name with no prefix, parent) in parent order: the middle, the left side,
    then the right side."""
    right = tuple(
        (n.replace('Left', 'Right'), None if q is None else q.replace('Left', 'Right'))
        for n, q in MIXAMO_SIDE
    )
    return MIXAMO_CENTER + MIXAMO_SIDE + right


def is_end(name):
    """Tells if a bone ends a chain and holds no weight."""
    return name.endswith('_End') or (name[-1] == '4' and 'Hand' in name)


def mixamo_joints(p):
    """Gives the head of each Mixamo bone in meters (studio axes, T-pose). The spine bones split the
    line from the hips to the neck as in `Xbot.glb` (0.22, 0.44, and 0.64 of the line). The
    fingers lie side by side in the paw, which has no gaps between them."""
    at = landmarks(p)
    h = p['height']
    hips, neck = at['pelvis'], at['neck']
    j = {
        'Hips': hips,
        'Spine': hips.lerp(neck, 0.22),
        'Spine1': hips.lerp(neck, 0.44),
        'Spine2': hips.lerp(neck, 0.64),
        'Neck': neck,
        'Head': at['chin'],
        'HeadTop_End': at['top'],
        'LeftShoulder': Vector((at['shoulder'].x * 0.3, at['shoulder'].y, 0)),
        'LeftArm': at['shoulder'],
        'LeftForeArm': at['elbow'],
        'LeftHand': at['wrist'],
        'LeftUpLeg': at['hip'],
        'LeftLeg': at['knee'],
        'LeftFoot': at['ankle'],
        'LeftToeBase': at['ball'],
        'LeftToe_End': at['toe'],
    }
    w, t = at['wrist'], at['tip']
    half = p['hand']['width'] * h
    for finger, z in (('Index', 0.6), ('Middle', 0.2), ('Ring', -0.2), ('Pinky', -0.6)):
        for k, f in ((1, 0.45), (2, 0.62), (3, 0.79), (4, 1.0)):
            j[f'LeftHand{finger}{k}'] = w.lerp(t, f) + Vector((0, 0, z * half * (1 - 0.3 * f)))
    for k, f in ((1, 0.1), (2, 0.4), (3, 0.7), (4, 1.0)):
        j[f'LeftHandThumb{k}'] = at['thumb_base'].lerp(at['thumb_tip'], f)
    for name in list(j):
        if name.startswith('Left'):
            j[name.replace('Left', 'Right')] = mirror(j[name])
    return j


def bone_tail(name, joints, bones):
    """Gives the end of a bone for the automatic weights: the head of its main child, or a short
    step past the head along the parent bone for a bone that ends a chain."""
    main = {
        'Hips': 'Spine',
        'Spine2': 'Neck',
        'LeftHand': 'LeftHandMiddle1',
        'RightHand': 'RightHandMiddle1',
    }
    children = [n for n, q in bones if q == name]
    child = main.get(name, children[0] if children else None)
    if child:
        return joints[child]
    parent = dict(bones)[name]
    step = joints[name] - joints[parent]
    return joints[name] + step.normalized() * min(step.length, 0.03)


def mixamo_rig(p, body):
    """Adds the Mixamo skeleton in the T-pose, parents the body with automatic weights, and runs
    Limit Total 4 and Normalize All. Then each bone turns up with no roll, so that each joint has
    no turn in the rest pose, as the joints of `Xbot.glb`. Gives the armature object."""
    bones = mixamo_bones()
    joints = mixamo_joints(p)
    arm = bpy.data.armatures.new('Armature')
    rig = bpy.data.objects.new('Armature', arm)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for name, parent in bones:
        eb = arm.edit_bones.new(PREFIX + name)
        eb.head = to_blender(joints[name])
        eb.tail = to_blender(bone_tail(name, joints, bones))
        eb.roll = 0.0
        eb.use_connect = False
        eb.use_deform = not is_end(name)
        if parent:
            eb.parent = arm.edit_bones[PREFIX + parent]
    bpy.ops.object.mode_set(mode='OBJECT')

    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)

    # Each bone points up (+z of Blender, +y of glTF and FBX) with no roll: the rest pose of each
    # joint is then a pure move from its parent, as in a Mixamo file.
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    size = 0.05 * p['height']
    for eb in arm.edit_bones:
        eb.tail = eb.head + Vector((0, 0, size))
        eb.roll = 0.0
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    return rig


def quat(axis, degrees):
    """Gives the turn about an axis of Blender by an angle in degrees."""
    return Quaternion(Vector(axis).normalized(), math.radians(degrees))


#: The rest turn of each bone of the armature: the bones point up (+z) with no roll, so the axes of
#: a bone are +x, +z (along the bone), and -y of Blender.
BONE_REST = Quaternion((1, 0, 0), math.radians(90))


def local(turn):
    """Gives the pose turn of a bone, in the axes of the bone, for a turn in the axes of Blender.
    Each bone has the same rest turn, so the turns of a chain compose in the same way."""
    return BONE_REST.inverted() @ turn @ BONE_REST


def ramp(frame, keys):
    """Gives the value at a frame of a line through the keys (frame, value), held at the ends."""
    if frame <= keys[0][0]:
        return keys[0][1]
    for (f0, v0), (f1, v1) in zip(keys, keys[1:]):
        if frame <= f1:
            s = (frame - f0) / (f1 - f0)
            s = s * s * (3 - 2 * s)
            return v0 + (v1 - v0) * s
    return keys[-1][1]


def two_bone(shoulder, target, upper, fore, pole):
    """Gives the directions of the upper arm and of the forearm that put the wrist at the target,
    with the elbow toward the pole (a direction)."""
    d = target - shoulder
    dist = min(d.length, (upper + fore) * 0.999)
    u = d.normalized()
    a = (upper * upper - fore * fore + dist * dist) / (2 * dist)
    hgt = math.sqrt(max(0.0, upper * upper - a * a))
    v = (pole - u * pole.dot(u)).normalized()
    elbow = shoulder + u * a + v * hgt
    wrist = shoulder + u * dist
    return (elbow - shoulder).normalized(), (wrist - elbow).normalized()


def aim(rest, direction):
    """Gives the turn with no twist that takes the rest direction of a bone to a direction."""
    return Vector(rest).rotation_difference(direction)


def twist_to(turn, axis, normal, target):
    """Gives the angle in degrees about the axis that takes the turned normal nearest to the target
    direction."""
    n = turn @ Vector(normal)
    n = (n - axis * n.dot(axis)).normalized()
    t = (target - axis * target.dot(axis)).normalized()
    return math.degrees(math.atan2(axis.dot(n.cross(t)), n.dot(t)))


def clip_wave(p, j, f):
    """The right arm rises, the forearm stands up with the palm forward, and the forearm waves
    from side to side 3 times."""
    up = ramp(f, ((0, 0.0), (12, 1.0), (60, 1.0), (72, 0.0)))
    wave = ramp(f, ((12, 0), (20, 25), (28, -15), (36, 25), (44, -15), (52, 25), (60, 0)))
    return {
        'RightArm': quat((0, 1, 0), 60 * up),
        'RightForeArm': quat((0, 1, 0), (30 + wave) * up),
        'RightHand': quat((1, 0, 0), -90 * up),
    }, 72


def clip_bow(p, j, f):
    """The trunk bends 30 degrees forward, holds, and comes back: 10 degrees on each spine bone."""
    bend = ramp(f, ((0, 0.0), (20, 10.0), (35, 10.0), (55, 0.0)))
    return {name: quat((1, 0, 0), bend) for name in ('Spine', 'Spine1', 'Spine2')}, 55


def clap_pose(p, j, gap):
    """Gives the turns of the arms and the hands that put the wrists in front of the chest, with the
    palms facing each other, `gap` meters from the middle."""
    turns = {}
    for side, sign in (('Left', 1), ('Right', -1)):
        s = to_blender(j[side + 'Arm'])
        e, w, t = (to_blender(j[side + k]) for k in ('ForeArm', 'Hand', 'HandMiddle4'))
        upper, fore = (e - s).length, (w - e).length
        hand = (t - w).length
        target = Vector((sign * gap, s.y - 0.8 * (upper + fore) + 0.2 * hand, s.z - 0.25 * upper))
        target.x = sign * (gap + 0.1 * hand)
        pole = Vector((sign * 1.0, 0.3, -1.0))
        d1, d2 = two_bone(s, target, upper, fore, pole)
        rest = Vector((sign, 0, 0))
        q1 = aim(rest, d1)
        q2 = aim(rest, d2)
        roll = twist_to(q2, d2, (0, 0, -1), Vector((-sign, 0, 0)))
        turns[side + 'Arm'] = q1
        turns[side + 'ForeArm'] = q1.inverted() @ q2
        turns[side + 'Hand'] = quat(rest, roll)
    return turns


def clip_clap(p, j, f):
    """The arms come forward, and the paws meet in front of the chest 4 times."""
    reach = ramp(f, ((0, 0.0), (15, 1.0), (63, 1.0), (78, 0.0)))
    beat = (
        (15, 1.0),
        (21, 0.0),
        (27, 1.0),
        (33, 0.0),
        (39, 1.0),
        (45, 0.0),
        (51, 1.0),
        (57, 0.0),
        (63, 1.0),
    )
    open_ = ramp(f, beat)
    hand = (j['LeftHandMiddle4'] - j['LeftHand']).length
    thick = p['hand']['thick'] * p['height']
    gap = thick + open_ * 1.2 * hand
    pose = clap_pose(p, j, gap)
    return {k: Quaternion().slerp(q, reach) for k, q in pose.items()}, 78


def clip_forearm_twist(p, j, f):
    """Each forearm turns about its own axis from -90 degrees (the palm forward and the thumb up)
    to +90 degrees (the palm back and the thumb down) and back to 0. The two sides mirror each
    other, so both turn the same way: the turn about +x of Blender."""
    angle = ramp(f, ((0, 0.0), (15, -90.0), (45, 90.0), (60, 0.0)))
    return {'LeftForeArm': quat((1, 0, 0), angle), 'RightForeArm': quat((1, 0, 0), angle)}, 60


def clip_tpose(p, j, f):
    """The rest pose, one frame."""
    return {}, 0


def hanging_arms(swing_left, swing_right, bend_left, bend_right, out=8.0):
    """Gives the turns of two arms that hang at the sides: each arm turns down from the T-pose to
    `out` degrees from the vertical, swings forward by its swing, and bends its elbow forward by
    its bend (degrees). The wrists stay straight, so the palms face the thighs."""
    turns = {}
    for side, sign, swing, bend in (
        ('Left', 1, swing_left, bend_left),
        ('Right', -1, swing_right, bend_right),
    ):
        down = quat((0, 1, 0), sign * (90.0 - out))
        # A turn about +x moves a hanging arm back, so a forward swing turns about -x.
        upper = quat((1, 0, 0), -swing) @ down
        fore = quat((1, 0, 0), -(swing + bend)) @ down
        turns[side + 'Arm'] = upper
        turns[side + 'ForeArm'] = upper.inverted() @ fore
    return turns


def clip_idle(p, j, f):
    """The arms hang at the sides, and the body sways a little from side to side: the trunk leans
    1.5 degrees to each side, the head leans back against it, and the arms swing 2 degrees, once in
    3 seconds."""
    last = 90
    phase = 2 * math.pi * f / last
    lean = 1.5 * math.sin(phase)
    swing = 2.0 * math.sin(phase + math.pi / 2)
    turns = hanging_arms(swing, -swing, 12.0, 12.0)
    turns['Spine1'] = quat((0, 1, 0), lean)
    turns['Head'] = quat((0, 1, 0), -lean)
    return turns, last


#: The walk of the `Walk` clip: a slow walk with the feet flat on the floor. A stride (two steps)
#: takes 32 frames (112 steps a minute), the step is 0.35 m, each foot stands for 60% of the
#: stride (Winter, "Biomechanics and Motor Control of Human Movement", 4th ed., 2009, 4.0), the
#: swing lifts the ankle 0.08 m, and the arms swing 12 degrees to each side, against the legs.
WALK = {'stride': 32, 'step': 0.35, 'stance': 0.6, 'lift': 0.08, 'arms': 12.0, 'strides': 2}

#: The longest reach of a leg in the walk, as a share of its length: the knee of the standing leg
#: then bends about 16 degrees, as a real knee in the loading response.
WALK_REACH = 0.99


def walk_foot(phase, start, stride):
    """Gives the forward place and the lift share of a foot at a phase of its stride: the foot
    stands at `start` in the stance, and moves one stride forward in an arc in the swing."""
    stance = WALK['stance']
    if phase < stance:
        return start, 0.0
    s = (phase - stance) / (1 - stance)
    return start + stride * s * s * (3 - 2 * s), math.sin(math.pi * s)


def clip_walk(p, j, f):
    """The body walks forward: the hips move forward at a steady speed and bob up and down, each
    foot stands flat on the floor and swings forward in an arc, the knees point forward (a turn
    of each leg from the hip and the knee, `two_bone()`), and the arms swing against the legs. A
    foot that stands does not slide on the floor."""
    period = WALK['stride']
    stride = 2 * WALK['step']
    speed = stride / period
    last = period * WALK['strides']
    hips = {side: to_blender(j[side + 'UpLeg']) for side in ('Left', 'Right')}
    knees = {side: to_blender(j[side + 'Leg']) for side in ('Left', 'Right')}
    ankles = {side: to_blender(j[side + 'Foot']) for side in ('Left', 'Right')}
    thigh = (knees['Left'] - hips['Left']).length
    shin = (ankles['Left'] - knees['Left']).length
    reach = WALK_REACH * (thigh + shin)

    # The left foot lands at the start of each stride, and the right foot half a stride later.
    # A foot lands 0.3 strides in front of its hip, so that it stands under the hip in the middle
    # of its stance.
    feet = {}
    for side, offset in (('Left', 0.0), ('Right', 0.5)):
        phase = (f / period + offset) % 1.0
        land = f - phase * period
        forward, lift = walk_foot(phase, speed * land + 0.3 * stride, stride)
        feet[side] = (forward, lift, phase < WALK['stance'])
    move = speed * f
    rise = min(
        math.sqrt(max(0.0, reach * reach - (forward - move) ** 2))
        - (hips['Left'].z - ankles['Left'].z)
        for forward, _, stands in feet.values()
        if stands
    )
    rise = min(0.0, rise)
    # Blender: the front is -y.
    offset = Vector((0, -move, rise))

    turns = {}
    for side, (forward, lift, _) in feet.items():
        hip = hips[side] + offset
        ankle = Vector((ankles[side].x, ankles[side].y - forward, ankles[side].z))
        ankle.z += WALK['lift'] * lift
        d1, d2 = two_bone(hip, ankle, thigh, shin, Vector((0, -1, 0)))
        q1 = aim(knees[side] - hips[side], d1)
        q2 = aim(ankles[side] - knees[side], d2)
        turns[side + 'UpLeg'] = q1
        turns[side + 'Leg'] = q1.inverted() @ q2
        # The foot keeps its rest turn in the world, so the sole stays flat.
        turns[side + 'Foot'] = q2.inverted()

    swing = WALK['arms'] * math.cos(2 * math.pi * f / period)
    turns.update(
        hanging_arms(-swing, swing, 15.0 + max(0.0, -swing) / 2, 15.0 + max(0.0, swing) / 2)
    )
    return turns, last, offset


#: The test clips, in their order in the files.
CLIPS = (
    ('TPose', clip_tpose),
    ('Wave', clip_wave),
    ('Bow', clip_bow),
    ('Clap', clip_clap),
    ('ForearmTwist', clip_forearm_twist),
    ('Idle', clip_idle),
    ('Walk', clip_walk),
)


def add_clips(p, rig):
    """Keys each test clip as an action on each frame: the turn of each bone, and the place of the
    hips, which carry the root motion in a Mixamo file. A clip function gives the turns and its
    last frame, and the move of the hips in meters in the axes of Blender when the hips move. Each
    action has a fake user, so that the exporters see it."""
    j = mixamo_joints(p)
    names = [PREFIX + n for n, _ in mixamo_bones()]
    rig.animation_data_create()
    actions = []
    for clip, fn in CLIPS:
        last = fn(p, j, 0)[1]
        action = bpy.data.actions.new(clip)
        action.use_fake_user = True
        rig.animation_data.action = action
        for f in range(last + 1):
            turns, _, *move = fn(p, j, f)
            for name in names:
                pb = rig.pose.bones[name]
                pb.rotation_quaternion = local(turns.get(name[len(PREFIX) :], Quaternion()))
                pb.keyframe_insert('rotation_quaternion', frame=f)
            hips = rig.pose.bones[PREFIX + 'Hips']
            # The place of a pose bone is in the axes of the bone (`BONE_REST`).
            hips.location = BONE_REST.inverted() @ move[0] if move else Vector((0, 0, 0))
            hips.keyframe_insert('location', frame=f)
        action.frame_range = (0, max(last, 0))
        action.use_frame_range = True
        actions.append(action)
    rig.animation_data.action = None
    for pb in rig.pose.bones:
        pb.rotation_quaternion = Quaternion()
        pb.location = (0, 0, 0)
    return actions


#: The angle of each arm below the level in the A-pose, in degrees, near the 43 degrees of the
#: upper arm of the wolf mesh (`tools/mesh-rigs/wolf.json`). An angle of 45 degrees gives the
#: arm direction 0.707107 in the studio module, which the lint refuses as an approximate
#: `Math.SQRT1_2`.
A_POSE = 40.0


def a_pose_mesh(rig, body, name):
    """Turns each arm `A_POSE` degrees down from the T-pose, about the forward axis at the
    shoulder joint, and gives a copy of the skinned body in this pose, with no skeleton."""
    rig.pose.bones[PREFIX + 'LeftArm'].rotation_quaternion = local(quat((0, 1, 0), A_POSE))
    rig.pose.bones[PREFIX + 'RightArm'].rotation_quaternion = local(quat((0, 1, 0), -A_POSE))
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(body.evaluated_get(depsgraph))
    me.name = name
    for pb in rig.pose.bones:
        pb.rotation_quaternion = Quaternion()
    bpy.context.view_layer.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.vertex_groups.clear()
    return ob


#: The centimeters for each meter: a Mixamo FBX file is in centimeters (`UnitScaleFactor` 1 in
#: `Samba Dancing.fbx`), and the joints of `Xbot.glb` are in centimeters under an armature node
#: with the scale 0.01.
CM = 100.0


def to_centimeters(objects, rig=None):
    """Puts the data of the objects and of the skeleton in centimeters, with the scale 0.01 on each
    top object, so that the world size stays in meters."""
    for ob in objects:
        ob.data.transform(Matrix.Scale(CM, 4))
        if ob.parent is None:
            ob.scale = (1 / CM,) * 3
    if rig:
        bpy.ops.object.select_all(action='DESELECT')
        bpy.context.view_layer.objects.active = rig
        bpy.ops.object.mode_set(mode='EDIT')
        for eb in rig.data.edit_bones:
            eb.head = eb.head * CM
            eb.tail = eb.tail * CM
            eb.roll = 0.0
        bpy.ops.object.mode_set(mode='OBJECT')
        rig.scale = (1 / CM,) * 3
        # The keyed places of the bones (the move of the hips) are in the units of the skeleton.
        for curve in action_curves():
            if curve.data_path.endswith('.location'):
                for key in curve.keyframe_points:
                    key.co.y *= CM
                    key.handle_left.y *= CM
                    key.handle_right.y *= CM
    bpy.context.view_layer.update()


def action_curves():
    """Gives the F-curves of each action, through the slots of the layered actions of Blender."""
    from bpy_extras import anim_utils

    for action in bpy.data.actions:
        for slot in action.slots:
            bag = anim_utils.action_get_channelbag_for_slot(action, slot)
            if bag:
                yield from bag.fcurves


def select(objects):
    """Selects only the objects, with the first one active."""
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def write_glb(path, objects, rigged):
    """Writes the selected objects as a GLB file, with the palette texture as PNG."""
    select(objects)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=False,
        export_image_format='AUTO',
        export_extras=False,
        export_attributes=False,
        export_tangents=False,
        export_morph=False,
        export_skins=rigged,
        export_animations=rigged,
        export_animation_mode='ACTIONS',
        export_force_sampling=True,
        export_def_bones=False,
        export_rest_position_armature=True,
        export_reset_pose_bones=True,
        export_optimize_animation_size=False,
    )


def steady_fbx():
    """Makes the FBX exporter give the same bytes on each run and in each folder: a fixed creation
    time, and the relative path of the texture in place of its full path, which holds the folder
    of the output."""
    import types

    import io_scene_fbx.export_fbx_bin as fbx_bin

    class Fixed(datetime.datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime.datetime(2026, 1, 1)

    fbx_bin.datetime = types.SimpleNamespace(datetime=Fixed)
    full_path = getattr(fbx_bin, '_mannequin_gen_vid_path', fbx_bin._gen_vid_path)
    fbx_bin._mannequin_gen_vid_path = full_path

    def relative_path(img, scene_data):
        rel = full_path(img, scene_data)[1]
        return rel, rel

    fbx_bin._gen_vid_path = relative_path


def write_fbx(path, objects, rigged):
    """Writes the selected objects as an FBX file in centimeters, Y up and the front +Z, as a
    Mixamo download. The bones point along +Y, so each joint has no rest turn, and no leaf bone is
    added. Each action is one take."""
    steady_fbx()
    select(objects)
    bpy.ops.export_scene.fbx(
        filepath=path,
        use_selection=True,
        object_types={'ARMATURE', 'MESH'} if rigged else {'MESH'},
        global_scale=1.0,
        apply_unit_scale=True,
        apply_scale_options='FBX_SCALE_NONE',
        axis_forward='-Z',
        axis_up='Y',
        use_mesh_modifiers=False,
        mesh_smooth_type='FACE',
        add_leaf_bones=False,
        primary_bone_axis='Y',
        secondary_bone_axis='X',
        armature_nodetype='NULL',
        use_armature_deform_only=False,
        bake_anim=rigged,
        bake_anim_use_all_bones=True,
        bake_anim_use_nla_strips=False,
        bake_anim_use_all_actions=True,
        bake_anim_force_startend_keying=True,
        bake_anim_step=1.0,
        bake_anim_simplify_factor=1.0,
        path_mode='COPY',
        embed_textures=True,
    )


def clear_scene():
    """Removes each object and each data block of the start file."""
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob)
    for coll in (
        bpy.data.meshes,
        bpy.data.armatures,
        bpy.data.actions,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for block in list(coll):
            coll.remove(block)
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.render.fps_base = 1.0
    scene.frame_start = 0


def build(preset, work):
    """Makes the scene of one preset: the T-pose body with the Mixamo skeleton and the clips, and
    the A-pose body. `work` is a folder for the palette texture. Gives the objects."""
    clear_scene()
    p = PRESETS[preset]()
    body = body_object(p, 'Mannequin')
    for f in body.data.polygons:
        f.use_smooth = True
    counts = paint(p, body, work)
    image = bpy.data.images['mannequin-palette']
    image.filepath_raw = 'mannequin-palette.png'
    rig = mixamo_rig(p, body)
    pose = a_pose_mesh(rig, body, 'MannequinAPose')
    add_clips(p, rig)
    flat = bpy.data.objects.new('MannequinTPose', body.data.copy())
    bpy.context.scene.collection.objects.link(flat)
    return {'preset': p, 'body': body, 'rig': rig, 'apose': pose, 'tpose': flat, 'counts': counts}


def write_files(scene, out):
    """Writes the four files of a preset into the folder `out`, and gives their paths."""
    name = 'mannequin-' + scene['preset']['name']
    paths = {
        'apose': os.path.join(out, name + '.glb'),
        'tpose': os.path.join(out, name + '-tpose.fbx'),
        'glb': os.path.join(out, name + '-mixamo.glb'),
        'fbx': os.path.join(out, name + '-mixamo.fbx'),
    }
    write_glb(paths['apose'], [scene['apose']], False)
    to_centimeters([scene['tpose']])
    write_fbx(paths['tpose'], [scene['tpose']], False)
    to_centimeters([scene['body']], scene['rig'])
    write_glb(paths['glb'], [scene['rig'], scene['body']], True)
    write_fbx(paths['fbx'], [scene['rig'], scene['body']], True)
    return paths


def main():
    argv = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else []
    if len(argv) != 3 or argv[0] not in PRESETS or argv[1] != '--out':
        raise SystemExit(
            'Usage: blender -b --factory-startup --python '
            'tools/blender/mannequin.py -- <human|animal> --out <dir>'
        )
    if sys.flags.hash_randomization:
        # The FBX exporter makes its ids from the string hash, so the run needs a fixed seed.
        env = dict(os.environ, PYTHONHASHSEED='0')
        code = subprocess.call(
            [
                bpy.app.binary_path,
                '-b',
                '--factory-startup',
                '--python-use-system-env',
                '--python',
                os.path.abspath(__file__),
                '--',
                *argv,
            ],
            env=env,
        )
        raise SystemExit(code)
    preset, out = argv[0], os.path.abspath(argv[2])
    os.makedirs(out, exist_ok=True)
    import tempfile

    with tempfile.TemporaryDirectory() as work:
        scene = build(preset, work)
        paths = write_files(scene, out)
    me = scene['body'].data
    print(
        f'mannequin {preset}: {len(me.vertices)} vertices, {len(me.polygons)} quads, '
        f'{2 * len(me.polygons)} triangles'
    )
    print('colors: ' + ', '.join(f'{k} {v}' for k, v in sorted(scene['counts'].items())))
    for key, path in paths.items():
        with open(path, 'rb') as f:
            digest = hashlib.sha256(f.read()).hexdigest()
        print(f'{os.path.basename(path)}: {os.path.getsize(path)} bytes, sha256 {digest}')


if __name__ == '__main__':
    main()
