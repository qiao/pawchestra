# Output: `assets/forest/forest-kit.glb`.
"""Builds the low-poly forest kit of the forest scene, in Blender (batch).

The kit is the art of the forest clearing of `docs/reference/forest.webp`: the parts and their
places around the stage of the default demo. The script makes all geometry itself from one seed,
so the same script gives the same GLB file. It imports, downloads, and generates no model.

    blender -b --factory-startup -P tools/forest-kit/build-kit.py -- <out.glb> [--render <dir>]

The GLB file holds:

- one mesh object for each part, at the origin, in meters. Each face has one color (the color
  attribute `Col`) and one material, whose name is the kind of the face: `matte`, `glow`,
  `water`, or `foliage`;
- one empty for each placed copy of a part, with the part name in the custom property `part`;
- one empty for each end of a rope of the light string, as a child of the empty of its tree, with
  the custom properties `rope` (the rope index), `end` (0 or 1), `slack` (the extra length of the
  rope, as a part of the distance between its ends), and `lanterns` (the lantern count);
- the empty `stage`, with the stage side of the placements in the custom property `side`.

`pnpm forest-kit` turns the file into `src/models/forest/kit-data.ts`. `--render <dir>` also
renders the reference view, the five views, and the sheet of the parts into the folder, with a
stage proxy, a warm low sun from the back right, and a copy of each part at each place.

The script writes each point in the axes of the app: x to the right of the audience, y up, and z
toward the audience. `blender_point()` turns a point into the axes of Blender, and the export
turns it back.
"""

import math
import random
import sys

import bmesh
import bpy
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt

#: The seed of all random choices. Each part has its own generator from this seed and its name.
SEED = 1030

#: The stage side of the default demo `mozart-k191`, in meters (`layoutScene()`).
STAGE_SIDE = 8.488

#: The corner cut of the stage octagon, as a part of the side (`STAGE_CORNER_CUT`).
STAGE_CORNER_CUT = 0.1

#: The thickness of the stage slab, in meters (`STAGE_THICKNESS`). The ground is at its bottom.
STAGE_THICKNESS = 0.4

#: The height of the ground. The stage top is at 0.
GROUND_Y = -STAGE_THICKNESS

#: The default view of the app for the stage of the default demo at 1600 x 1000 (`defaultView()`):
#: the camera, the target, and the vertical field of view in degrees.
CAMERA = {'position': (0.0, 7.626, 13.509), 'target': (0.0, -0.25, -0.7), 'fov': 30.0}

#: The aspect of the reference view.
ASPECT = 1.6

#: The kinds of the faces, in the order of the material slots of each part.
KINDS = ('matte', 'glow', 'water', 'foliage')

#: The albedo of each color name, as sRGB. A render under a warm sun moves each color toward the
#: medians of the reference (`docs/reference/forest.webp`).
PALETTE = {
    'bark': '#5e4330',
    'bark-dark': '#47321f',
    'bark-light': '#77573b',
    'bark-moss': '#4f5528',
    'log-bark': '#6e4428',
    'log-bark-dark': '#563420',
    'wood-cut': '#dba76c',
    'wood-ring': '#9a6436',
    'leaf-light': '#909c33',
    'leaf': '#6a7c2b',
    'leaf-dark': '#475a23',
    'leaf-deep': '#33431a',
    'fern': '#929530',
    'fern-dark': '#6f7626',
    'grass': '#88973a',
    'moss': '#66682c',
    'rock': '#6a645c',
    'rock-dark': '#514b45',
    'rock-light': '#857f76',
    'rock-warm': '#6e6050',
    'earth': '#7a5639',
    'earth-dark': '#5f412b',
    'earth-light': '#8f6845',
    'litter': '#6f4a2a',
    'path': '#80603f',
    'path-light': '#906e4a',
    'rock-blue-light': '#626872',
    'rock-blue': '#4a5059',
    'rock-blue-dark': '#363a42',
    'rock-wet': '#4a4640',
    'rock-wet-dark': '#34302c',
    'water': '#3d4a52',
    'water-deep': '#2b343b',
    'water-cream': '#95856e',
    'water-cream-light': '#afa386',
    'water-streak': '#5c5040',
    'water-glint': '#f0b85a',
    'foam': '#c9c1b2',
    'iron': '#2e2925',
    'iron-light': '#4a423a',
    'glass': '#ffb85c',
    'flame': '#ffd98a',
}


def linear(name):
    """Gives the linear RGB of a color of the palette."""
    return linear_hex(PALETTE[name])


def linear_hex(text):
    """Gives the linear RGB of an sRGB color in hex, such as `#6b5236`."""
    text = text.lstrip('#')
    channels = [int(text[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels)


def blender_point(p):
    """Turns a point in the axes of the app (y up, z to the audience) into the axes of Blender."""
    return Vector((p[0], -p[2], p[1]))


def app_point(v):
    """Turns a point in the axes of Blender into the axes of the app."""
    return Vector((v[0], v[2], -v[1]))


def face_normal(points, face):
    """Gives the unit normal of a face by the method of Newell, and its center."""
    n = Vector((0.0, 0.0, 0.0))
    for i, a in enumerate(face):
        p, q = points[a], points[face[(i + 1) % len(face)]]
        n.x += (p[1] - q[1]) * (p[2] + q[2])
        n.y += (p[2] - q[2]) * (p[0] + q[0])
        n.z += (p[0] - q[0]) * (p[1] + q[1])
    center = sum((Vector(points[a]) for a in face), Vector()) / len(face)
    return (n.normalized() if n.length > 1e-12 else Vector((0.0, 1.0, 0.0))), center


class Part:
    """A mesh of one part in the axes of the app, with one color and one kind on each face."""

    def __init__(self, name):
        self.name = name
        self.rng = random.Random(f'{SEED}-{name}')
        self.bm = bmesh.new()
        self.color = self.bm.loops.layers.float_color.new('Col')

    def add(self, points, faces, paint, outward=None):
        """Adds faces with the color and the kind of `paint(normal, center)` for each face.

        `outward(center)` gives a point inside the solid. A face whose normal points to that point
        turns over. With `'up'`, each face turns to +y.
        """
        verts = [self.bm.verts.new(blender_point(p)) for p in points]
        for face in faces:
            normal, center = face_normal(points, face)
            if outward == 'up':
                flip = normal.y < 0
            elif outward is not None:
                flip = normal.dot(center - Vector(outward(center))) < 0
            else:
                flip = False
            if flip:
                face = tuple(reversed(face))
                normal = -normal
            color, kind = paint(normal, center)
            f = self.bm.faces.new([verts[i] for i in face])
            f.material_index = KINDS.index(kind)
            for loop in f.loops:
                loop[self.color] = (*color, 1.0)

    def finish(self, collection):
        """Turns the part into a triangulated mesh object in the collection."""
        bmesh.ops.triangulate(
            self.bm, faces=self.bm.faces[:], quad_method='FIXED', ngon_method='EAR_CLIP'
        )
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        mesh.color_attributes.active_color = mesh.color_attributes['Col']
        mesh.color_attributes.render_color_index = 0
        for kind in KINDS:
            mesh.materials.append(material(kind))
        obj = bpy.data.objects.new(self.name, mesh)
        collection.objects.link(obj)
        return obj


def material(kind):
    """Gives the material of a kind of face, for the export and for the preview renders."""
    found = bpy.data.materials.get(kind)
    if found:
        return found
    mat = bpy.data.materials.new(kind)
    tree = mat.node_tree
    bsdf = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
    attr = tree.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    tree.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = {
        'matte': 0.9,
        'glow': 0.6,
        'water': 0.08,
        'foliage': 0.75,
    }[kind]
    if kind == 'glow':
        tree.links.new(attr.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = 3.5
    return mat


def pick(rng, choices):
    """Picks one name of a list of (name, weight) pairs."""
    total = sum(w for _, w in choices)
    x = rng.uniform(0, total)
    for name, w in choices:
        x -= w
        if x <= 0:
            return name
    return choices[-1][0]


def unit_sphere(detail):
    """Gives the unit points and the faces of a sphere of few faces.

    `detail` is `'ico'` for an icosphere of 80 triangles, or `'low'` for a sphere of 7 sides and 4
    bands (42 triangles), which looks less even. The script makes the points itself, because the
    order of the faces of `bmesh.ops.create_uvsphere()` changes from run to run.
    """
    if detail == 'low':
        points = [Vector((0.0, 1.0, 0.0))]
        for band in (1, 2, 3):
            y = math.cos(math.pi * band / 4)
            r = math.sin(math.pi * band / 4)
            points += [
                Vector(
                    (
                        r * math.cos(2 * math.pi * k / 7 + band * 0.45),
                        y,
                        r * math.sin(2 * math.pi * k / 7 + band * 0.45),
                    )
                )
                for k in range(7)
            ]
        points.append(Vector((0.0, -1.0, 0.0)))
        faces = [(0, 1 + (k + 1) % 7, 1 + k) for k in range(7)]
        for band in range(2):
            a, b = 1 + band * 7, 8 + band * 7
            faces += [(a + k, a + (k + 1) % 7, b + (k + 1) % 7, b + k) for k in range(7)]
        faces += [(22, 15 + k, 15 + (k + 1) % 7) for k in range(7)]
        return points, faces
    t = (1 + math.sqrt(5)) / 2
    points = [
        Vector(p).normalized()
        for p in (
            (-1, t, 0),
            (1, t, 0),
            (-1, -t, 0),
            (1, -t, 0),
            (0, -1, t),
            (0, 1, t),
            (0, -1, -t),
            (0, 1, -t),
            (t, 0, -1),
            (t, 0, 1),
            (-t, 0, -1),
            (-t, 0, 1),
        )
    ]
    base = [
        (0, 11, 5),
        (0, 5, 1),
        (0, 1, 7),
        (0, 7, 10),
        (0, 10, 11),
        (1, 5, 9),
        (5, 11, 4),
        (11, 10, 2),
        (10, 7, 6),
        (7, 1, 8),
        (3, 9, 4),
        (3, 4, 2),
        (3, 2, 6),
        (3, 6, 8),
        (3, 8, 9),
        (4, 9, 5),
        (2, 4, 11),
        (6, 2, 10),
        (8, 6, 7),
        (9, 8, 1),
    ]
    middles = {}

    def middle(a, b):
        key = (min(a, b), max(a, b))
        if key not in middles:
            middles[key] = len(points)
            points.append((points[a] + points[b]).normalized())
        return middles[key]

    faces = []
    for a, b, c in base:
        ab, bc, ca = middle(a, b), middle(b, c), middle(c, a)
        faces += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
    return points, faces


def blob(rng, center, radii, detail='ico', jitter=0.12):
    """Gives a faceted blob: a sphere of few faces with a random radius at each point."""
    unit, faces = unit_sphere(detail)
    points = []
    for d in unit:
        k = 1 + rng.uniform(-jitter, jitter)
        points.append(
            Vector(
                (
                    center[0] + d.x * radii[0] * k,
                    center[1] + d.y * radii[1] * k,
                    center[2] + d.z * radii[2] * k,
                )
            )
        )
    return points, faces


def hull(points):
    """Gives the points and the faces of the convex hull of points.

    A point inside the hull can be in both lists of the unused points, so each point goes into
    the delete one time.
    """
    tmp = bmesh.new()
    verts = [tmp.verts.new(p) for p in points]
    result = bmesh.ops.convex_hull(tmp, input=verts)
    unused = list(
        dict.fromkeys(
            g
            for g in result['geom_unused'] + result['geom_interior']
            if isinstance(g, bmesh.types.BMVert)
        )
    )
    bmesh.ops.delete(tmp, geom=unused, context='VERTS')
    tmp.verts.index_update()
    out = [Vector(v.co) for v in tmp.verts]
    faces = [tuple(v.index for v in f.verts) for f in tmp.faces]
    tmp.free()
    return out, faces


def rings_faces(ring_count, sides, cap_top=False, cap_bottom=False):
    """Gives the quads between rings of points, and a fan at each closed end."""
    faces = []
    for i in range(ring_count - 1):
        for k in range(sides):
            a, b = i * sides + k, i * sides + (k + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    if cap_bottom:
        faces.append(tuple(range(sides)))
    if cap_top:
        start = (ring_count - 1) * sides
        faces.append(tuple(range(start, start + sides)))
    return faces


def ring(center, radius, sides, start=0.0, axis_x=None, axis_y=None):
    """Gives a ring of points around a center, in the plane of two axes (xz by default)."""
    axis_x = axis_x or Vector((1.0, 0.0, 0.0))
    axis_y = axis_y or Vector((0.0, 0.0, 1.0))
    out = []
    for k in range(sides):
        a = start + 2 * math.pi * k / sides
        out.append(
            Vector(center) + axis_x * (radius * math.cos(a)) + axis_y * (radius * math.sin(a))
        )
    return out


def frame_of(direction):
    """Gives two unit axes at a right angle to a direction."""
    d = Vector(direction).normalized()
    helper = Vector((0.0, 1.0, 0.0)) if abs(d.y) < 0.9 else Vector((1.0, 0.0, 0.0))
    x = d.cross(helper).normalized()
    return x, d.cross(x).normalized()


def leaf_paint(rng, light=0.0):
    """Gives a paint of leaves: lighter faces turn up, darker faces turn down."""

    def paint(normal, center):
        t = 0.5 + 0.5 * normal.y + light + rng.uniform(-0.3, 0.3)
        name = (
            'leaf-light'
            if t > 0.85
            else 'leaf'
            if t > 0.5
            else 'leaf-dark'
            if t > 0.2
            else 'leaf-deep'
        )
        return linear(name), 'foliage'

    return paint


def bark_paint(rng, moss_below=0.0):
    """Gives a paint of bark, with moss on some faces below a height."""

    def paint(normal, center):
        if center.y < moss_below and rng.random() < 0.35:
            return linear('bark-moss'), 'matte'
        return linear(pick(rng, [('bark', 3), ('bark-dark', 2), ('bark-light', 1)])), 'matte'

    return paint


def solid_paint(names, kind='matte', rng=None):
    """Gives a paint that picks one color of a list of (name, weight) pairs for each face."""

    def paint(normal, center):
        return linear(pick(rng, names)), kind

    return paint


def branch(part, start, end, r0, r1, sides=5, segments=3, bend=0.0):
    """Adds a tapered branch from a start to an end, with a small upward bend."""
    rng = part.rng
    start, end = Vector(start), Vector(end)
    axis = end - start
    x, y = frame_of(axis)
    points, centers = [], []
    for i in range(segments + 1):
        t = i / segments
        c = start + axis * t + Vector((0.0, bend * math.sin(math.pi * t), 0.0))
        c += (
            Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1)))
            * 0.04
            * (0 < i < segments)
        )
        r = r0 + (r1 - r0) * t
        points += ring(c, r, sides, rng.uniform(0, 1), x, y)
        centers.append(c)
    faces = rings_faces(segments + 1, sides, cap_top=True)

    def inside(center):
        return min(centers, key=lambda c: (c - center).length)

    part.add(points, faces, bark_paint(rng), inside)


def crown(part, centers, count, size, flat=0.75, light=0.0, detail='ico'):
    """Adds leaf clusters around the centers of a crown.

    With `detail='ico'`, each cluster is two flat pads of few faces: a wide upper pad and a
    smaller, darker pad below it and to one side, so that the crown shows layers of leaves, as in
    the reference. Two pads of the `'low'` sphere have about the triangles of one icosphere. With
    `detail='low'`, each cluster is one blob, for the far trees.
    """
    rng = part.rng
    for i in range(count):
        c = Vector(centers[i % len(centers)])
        offset = Vector((rng.uniform(-1, 1), rng.uniform(-0.5, 0.6), rng.uniform(-1, 1)))
        c = c + offset * size * 0.8
        r = size * rng.uniform(0.7, 1.1)
        if detail == 'low':
            radii = (
                r * rng.uniform(0.9, 1.15),
                r * flat * rng.uniform(0.85, 1.1),
                r * rng.uniform(0.9, 1.15),
            )
            points, faces = blob(rng, c, radii, detail, 0.14)
            part.add(points, faces, leaf_paint(rng, light), lambda _, c=c: c)
            continue
        a = rng.uniform(0, 2 * math.pi)
        side = Vector((math.cos(a), 0.0, math.sin(a)))
        pads = (
            (c + Vector((0.0, r * 0.2, 0.0)), (1.1, 0.5 * flat / 0.75, 1.1), light),
            (c + side * (r * 0.55) - Vector((0.0, r * 0.3, 0.0)), (0.8, 0.4, 0.8), light - 0.2),
        )
        for center, (sx, sy, sz), shade in pads:
            radii = (
                r * sx * rng.uniform(0.85, 1.15),
                r * sy * rng.uniform(0.8, 1.15),
                r * sz * rng.uniform(0.85, 1.15),
            )
            points, faces = blob(rng, center, radii, 'low', 0.22)
            part.add(points, faces, leaf_paint(rng, shade), lambda _, c=center: c)


def trunk(part, spec):
    """Adds a trunk with buttress roots, and gives the ring centers of its axis.

    `spec` gives the height of the trunk, the radius above the roots, the taper, the flare of the
    roots, the root count, the lean (x, z) of the top, and the twist.
    """
    rng = part.rng
    sides = 8
    height = spec['trunk']
    radius = spec['radius']
    # The roots leave a gap at the angle 0 (+x). The yaw of each tree turns the gap to the deck,
    # so that the roots keep their space from the deck edge.
    roots = [
        2 * math.pi * (i + 0.5) / spec['roots'] + rng.uniform(-0.15, 0.15)
        for i in range(spec['roots'])
    ]
    levels = [-0.2, 0.0, 0.35, 0.8, 1.5] + [1.5 + (height - 1.5) * t for t in (0.2, 0.42, 0.7, 1.0)]
    lean = Vector((spec['lean'][0], 0.0, spec['lean'][1]))
    points, centers = [], []
    for y in levels:
        h = max(y, 0.0)
        center = lean * (h / height) ** 1.5 + Vector((0.0, y, 0.0))
        base = radius * (1 - spec['taper'] * h / height)
        flare = spec['flare'] * math.exp(-h / 0.6)
        twist = spec['twist'] * h
        for k in range(sides):
            a = 2 * math.pi * k / sides + twist
            lobe = max(max(0.0, math.cos(a - r)) ** 6 for r in roots)
            r = base * (1 + flare * (0.3 + 2.0 * lobe) + rng.uniform(-0.07, 0.07))
            if y < 0:
                r *= 1.12
            lift = rng.uniform(-0.06, 0.06) if y > 0 else 0.0
            points.append(center + Vector((r * math.cos(a), lift, r * math.sin(a))))
        centers.append(center)
    faces = rings_faces(len(levels), sides, cap_top=True)

    def inside(center):
        return min(centers, key=lambda c: abs(c.y - center.y))

    part.add(points, faces, bark_paint(rng, 1.4), inside)
    return centers


def build_tree(name, spec):
    """Builds a large tree: a trunk with buttress roots, branches, and a crown of leaf blobs.

    A low bough of `spec['boughs']` (height, angle in degrees from the gap of the roots, reach)
    holds leaves below the crown, so that the near trees show leaves at the top of the default
    view.
    """
    part = Part(name)
    rng = part.rng
    centers = trunk(part, spec)
    top = centers[-1]
    height = spec['trunk']

    def axis_at(y):
        return Vector((top.x, 0.0, top.z)) * (y / height) ** 1.5 + Vector((0.0, y, 0.0))

    ends = []
    for i in range(spec['branches']):
        # The branches leave out the side of the root gap, which faces the deck, so that the
        # crown hangs little over the stage, where a high camera looks down.
        a = math.radians(55 + 250 * (i + 0.5) / spec['branches']) + rng.uniform(-0.25, 0.25)
        start = axis_at(height * rng.uniform(0.82, 0.97))
        reach = spec['reach'] * rng.uniform(0.8, 1.1)
        end = start + Vector(
            (math.cos(a) * reach, reach * rng.uniform(0.5, 0.8), math.sin(a) * reach)
        )
        branch(part, start, end, spec['radius'] * 0.4, spec['radius'] * 0.15, bend=0.3)
        ends.append(end)
    ends.append(top + Vector((0.0, spec['crown'] * 0.7, 0.0)))
    crown(part, ends, spec['blobs'], spec['crown'], light=spec.get('light', 0.0))
    for y, angle, reach in spec.get('boughs', ()):
        a = math.radians(angle)
        start = axis_at(y)
        end = start + Vector((math.cos(a) * reach, reach * 0.25, math.sin(a) * reach))
        branch(part, start, end, spec['radius'] * 0.3, spec['radius'] * 0.1, segments=3, bend=0.35)
        mid = start + (end - start) * 0.6
        crown(part, [mid, end], 4, spec['crown'] * 0.6, flat=0.6, light=0.1)
    return part


def build_far_tree(name, spec):
    """Builds a smaller tree of the back rows: a plain trunk and a few leaf blobs."""
    part = Part(name)
    rng = part.rng
    height = spec['trunk']
    points, centers = [], []
    for y in (-0.2, height * 0.4, height):
        r = spec['radius'] * (1 - 0.35 * max(y, 0) / height)
        c = Vector((0.0, y, 0.0))
        points += ring(c, r, 6, rng.uniform(0, 1))
        centers.append(c)
    part.add(
        points,
        rings_faces(3, 6, cap_top=True),
        bark_paint(rng),
        lambda center: min(centers, key=lambda c: abs(c.y - center.y)),
    )
    top = Vector((0.0, height + spec['crown'] * 0.4, 0.0))
    crown(part, [top], spec['blobs'], spec['crown'], flat=0.9, detail=spec.get('detail', 'ico'))
    return part


def build_conifer(name, spec):
    """Builds a conifer of the back rows: a trunk and stacked faceted cones."""
    part = Part(name)
    rng = part.rng
    points = ring((0, -0.2, 0), spec['radius'], 5) + ring(
        (0, spec['height'] * 0.5, 0), spec['radius'] * 0.6, 5
    )
    part.add(
        points, rings_faces(2, 5, cap_top=True), bark_paint(rng), lambda c: Vector((0.0, c.y, 0.0))
    )
    tiers = spec['tiers']
    for i in range(tiers):
        t = i / tiers
        y0 = spec['height'] * (0.25 + 0.62 * t)
        r = spec['spread'] * (1 - 0.7 * t)
        h = spec['height'] * 0.32
        base = ring((0, y0, 0), r, 7, rng.uniform(0, 1))
        base = [p + Vector((0.0, rng.uniform(-0.15, 0.1), 0.0)) for p in base]
        tip = Vector((rng.uniform(-0.1, 0.1), y0 + h, rng.uniform(-0.1, 0.1)))
        pts = base + [tip]
        faces = [(k, (k + 1) % 7, 7) for k in range(7)] + [tuple(range(7))]
        c = Vector((0.0, y0 + h * 0.3, 0.0))

        def paint(normal, center, rng=rng):
            name = 'leaf-dark' if normal.y > -0.2 else 'leaf-deep'
            if rng.random() < 0.3:
                name = 'leaf'
            return linear(name), 'foliage'

        part.add(pts, faces, paint, lambda _, c=c: c)
    return part


def build_canopy(name, spec):
    """Builds a leafy bough that hangs into the top of the view: a branch and leaf blobs."""
    part = Part(name)
    rng = part.rng
    length = spec['length']
    end = Vector((length, -spec['drop'], 0.0))
    branch(part, (0, 0, 0), end, 0.13, 0.05, segments=4, bend=0.4)
    centers = [
        Vector((length * t, -spec['drop'] * t + 0.3, rng.uniform(-0.3, 0.3)))
        for t in (0.45, 0.7, 0.95)
    ]
    crown(part, centers, spec['blobs'], spec['size'], flat=0.7, light=0.1)
    return part


def build_bush(name, spec):
    """Builds a round bush of leaf blobs, lower blobs darker."""
    part = Part(name)
    rng = part.rng
    for i in range(spec['blobs']):
        a = 2 * math.pi * i / spec['blobs'] + rng.uniform(-0.3, 0.3)
        d = spec['size'] * (0.6 if i else 0.0) * rng.uniform(0.7, 1.1)
        r = spec['size'] * rng.uniform(0.5, 0.75) * (1.2 if i == 0 else 1.0)
        c = Vector(
            (math.cos(a) * d, r * 0.7 + (spec['size'] * 0.3 if i == 0 else 0.0), math.sin(a) * d)
        )
        radii = (r * rng.uniform(0.85, 1.2), r * rng.uniform(0.7, 0.95), r * rng.uniform(0.85, 1.2))
        points, faces = blob(rng, c, radii, 'ico' if spec.get('fine') else 'low', 0.24)
        part.add(points, faces, leaf_paint(rng, -0.2), lambda _, c=c: c)
    return part


def frond(rng, angle, length, rise, droop, leaflets, width):
    """Gives the points and the triangles of one fern frond: leaflets on each side of a rib."""
    direction = Vector((math.cos(angle), 0.0, math.sin(angle)))
    side = Vector((-direction.z, 0.0, direction.x))
    rib = []
    for i in range(leaflets + 1):
        t = i / leaflets
        y = rise * math.sin(math.pi * 0.62 * t) - droop * t * t
        rib.append(direction * (length * t) + Vector((0.0, y, 0.0)))
    points = list(rib)
    faces = []
    for i in range(leaflets):
        t = (i + 0.5) / leaflets
        w = width * math.sin(math.pi * (0.15 + 0.85 * t)) * (1 - 0.6 * t)
        a, b = rib[i], rib[i + 1]
        for s in (-1, 1):
            tip = (
                (a + b) / 2 + side * (s * w) + direction * (w * 0.5) + Vector((0.0, -w * 0.35, 0.0))
            )
            points.append(tip)
            faces.append((i, i + 1, len(points) - 1))
    return points, faces


def build_fern(name, spec):
    """Builds a fern: fronds that arch out from the center."""
    part = Part(name)
    rng = part.rng
    for i in range(spec['fronds']):
        angle = 2 * math.pi * i / spec['fronds'] + rng.uniform(-0.25, 0.25)
        length = spec['length'] * rng.uniform(0.8, 1.1)
        points, faces = frond(
            rng,
            angle,
            length,
            spec['rise'] * rng.uniform(0.8, 1.1),
            spec['droop'],
            spec['leaflets'],
            spec['width'],
        )
        shade = 'fern' if i % 2 == 0 else 'fern-dark'
        part.add(points, faces, lambda n, c, shade=shade: (linear(shade), 'foliage'), 'up')
    return part


def build_grass(name, spec):
    """Builds a tuft of grass: thin folded blades that lean out."""
    part = Part(name)
    rng = part.rng
    for i in range(spec['blades']):
        a = 2 * math.pi * i / spec['blades'] + rng.uniform(-0.3, 0.3)
        out = Vector((math.cos(a), 0.0, math.sin(a)))
        side = Vector((-out.z, 0.0, out.x))
        base = out * rng.uniform(0.0, spec['spread'])
        h = spec['height'] * rng.uniform(0.6, 1.1)
        tip = base + out * (h * 0.45) + Vector((0.0, h, 0.0))
        w = spec['width']
        points = [base - side * w, base + side * w, base + out * w * 0.6, tip]
        faces = [(0, 2, 3), (2, 1, 3)]
        name = 'grass' if rng.random() < 0.6 else 'fern'
        part.add(points, faces, lambda n, c, name=name: (linear(name), 'foliage'), 'up')
    return part


def build_moss(name, spec):
    """Builds a low patch of moss: a flat faceted mound."""
    part = Part(name)
    rng = part.rng
    sides = 9
    points = [Vector((0.0, spec['height'], 0.0))]
    for k in range(sides):
        a = 2 * math.pi * k / sides
        r = spec['radius'] * rng.uniform(0.7, 1.15)
        points.append(
            Vector(
                (r * 0.55 * math.cos(a + 0.2), spec['height'] * 0.6, r * 0.55 * math.sin(a + 0.2))
            )
        )
    for k in range(sides):
        a = 2 * math.pi * k / sides
        r = spec['radius'] * rng.uniform(0.85, 1.2)
        points.append(Vector((r * math.cos(a), -0.02, r * math.sin(a))))
    faces = [(0, 1 + k, 1 + (k + 1) % sides) for k in range(sides)]
    faces += [
        (1 + k, 1 + sides + k, 1 + sides + (k + 1) % sides, 1 + (k + 1) % sides)
        for k in range(sides)
    ]
    part.add(
        points,
        faces,
        solid_paint([('moss', 3), ('leaf-dark', 2), ('leaf-deep', 1)], 'foliage', rng),
        'up',
    )
    return part


def build_rock(name, spec):
    """Builds a faceted rock: the hull of random points in a flat ellipsoid, set into the ground."""
    part = Part(name)
    rng = part.rng
    size = spec['size']
    points = []
    for _ in range(spec['points']):
        d = Vector(
            (rng.gauss(0, 1), abs(rng.gauss(0, 1)) * 0.9 + 0.1, rng.gauss(0, 1))
        ).normalized()
        points.append(
            Vector((d.x * size[0], max(-0.08, d.y * size[1] - size[1] * 0.25), d.z * size[2]))
        )
    points, faces = hull(points)
    centroid = sum(points, Vector()) / len(points)

    lit, mid, shade = spec.get('tones', ('rock-light', 'rock', None))

    def paint(normal, center):
        if normal.y > 0.75 and rng.random() < spec.get('moss', 0.0):
            return linear('moss'), 'matte'
        light = normal.y + rng.uniform(-0.35, 0.35)
        if light > 0.6:
            return linear(lit), 'matte'
        if light > 0.0:
            return linear(mid), 'matte'
        return linear(shade or pick(rng, [('rock-dark', 2), ('rock-warm', 1)])), 'matte'

    part.add(points, faces, paint, lambda _: centroid)
    return part


def wood_end(part, center, radius, sides, axis, start, rings_count=3):
    """Adds the cut end of a log or a stump: bands of light wood and darker rings."""
    x, y = frame_of(axis)
    points = [Vector(center)]
    for i in range(1, rings_count + 1):
        points += ring(center, radius * i / rings_count, sides, start, x, y)
    faces = [(0, 1 + k, 1 + (k + 1) % sides) for k in range(sides)]
    for i in range(rings_count - 1):
        base = 1 + i * sides
        faces += [
            (base + k, base + sides + k, base + sides + (k + 1) % sides, base + (k + 1) % sides)
            for k in range(sides)
        ]
    bands = ['wood-cut'] + [
        ('wood-ring' if i % 2 == 0 else 'wood-cut') for i in range(rings_count - 1)
    ]
    colors = [bands[0]] * sides + [bands[1 + i // sides] for i in range((rings_count - 1) * sides)]
    order = iter(colors)
    out = Vector(axis).normalized()
    part.add(points, faces, lambda n, c: (linear(next(order)), 'matte'), lambda c: c - out)


def build_log(name, spec):
    """Builds a fallen log along x, with bark facets of one color and light cut ends with rings."""
    part = Part(name)
    rng = part.rng
    sides = 9
    length, radius = spec['length'], spec['radius']
    xs = [-length / 2 + length * t for t in (0.0, 0.22, 0.5, 0.78, 1.0)]
    points, centers = [], []
    for i, x in enumerate(xs):
        c = Vector(
            (x, radius * 0.92 + rng.uniform(-0.02, 0.02) * (0 < i < 4), rng.uniform(-0.03, 0.03))
        )
        r = radius * (1 + rng.uniform(-0.05, 0.06)) * (1 - 0.08 * (x + length / 2) / length)
        pts = ring(c, r, sides, 0.3, Vector((0.0, 0.0, 1.0)), Vector((0.0, 1.0, 0.0)))
        points += [p + Vector((0.0, rng.uniform(-0.02, 0.02), 0.0)) * (0 < i < 4) for p in pts]
        centers.append(c)
    faces = rings_faces(len(xs), sides)
    # The bark has one color, so that the baked light alone shades the facets. Colors of bark
    # for each side and a moss top made blocks of other colors, as a green block at one end.
    part.add(
        points,
        faces,
        lambda n, c: (linear('log-bark'), 'matte'),
        lambda c: min(centers, key=lambda k: abs(k.x - c.x)),
    )
    first, last = points[:sides], points[-sides:]
    for ring_points, center, axis in (
        (first, centers[0], Vector((-1.0, 0.0, 0.0))),
        (last, centers[-1], Vector((1.0, 0.0, 0.0))),
    ):
        r = sum((p - center).length for p in ring_points) / sides
        wood_end(part, center + axis * 0.005, r * 0.96, sides, axis, 0.3)
    return part


def build_stump(name, spec):
    """Builds a stump with roots and a flat top with rings, on which a lantern stands."""
    part = Part(name)
    rng = part.rng
    sides = 9
    height, radius = spec['height'], spec['radius']
    roots = [rng.uniform(0, 2 * math.pi) + 2 * math.pi * i / 4 for i in range(4)]
    points, centers = [], []
    for y in (-0.15, 0.0, 0.18, height * 0.6, height):
        flare = 0.45 * math.exp(-max(y, 0) / 0.16)
        c = Vector((0.0, y, 0.0))
        for k in range(sides):
            a = 2 * math.pi * k / sides
            lobe = max(max(0.0, math.cos(a - r)) ** 6 for r in roots)
            r = radius * (1 + flare * (0.2 + 1.0 * lobe) + rng.uniform(-0.04, 0.04))
            points.append(c + Vector((r * math.cos(a), 0.0, r * math.sin(a))))
        centers.append(c)
    part.add(
        points,
        rings_faces(5, sides),
        bark_paint(rng, 0.25),
        lambda c: min(centers, key=lambda k: abs(k.y - c.y)),
    )
    top = points[-sides:]
    r = sum((p - centers[-1]).length for p in top) / sides
    wood_end(part, centers[-1], r, sides, Vector((0.0, 1.0, 0.0)), 0.0, 4)
    return part


def box(part, lo, hi, color, kind='matte'):
    """Adds an axis-aligned box from a low corner to a high corner."""
    x0, y0, z0 = lo
    x1, y1, z1 = hi
    points = [
        Vector(p)
        for p in (
            (x0, y0, z0),
            (x1, y0, z0),
            (x1, y0, z1),
            (x0, y0, z1),
            (x0, y1, z0),
            (x1, y1, z0),
            (x1, y1, z1),
            (x0, y1, z1),
        )
    ]
    faces = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    c = (Vector(lo) + Vector(hi)) / 2
    part.add(points, faces, lambda n, cc: (linear(color), kind), lambda _: c)


def pyramid(part, base_y, half, height, color):
    """Adds a roof: a pyramid of four sides over a square base."""
    points = [
        Vector((x, base_y, z))
        for x, z in ((-half, -half), (half, -half), (half, half), (-half, half))
    ]
    points.append(Vector((0.0, base_y + height, 0.0)))
    faces = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (0, 1, 2, 3)]
    c = Vector((0.0, base_y + height * 0.3, 0.0))
    part.add(points, faces, lambda n, cc: (linear(color), 'matte'), lambda _: c)


def torus(part, center, radius, tube, segments, sides, color):
    """Adds a ring in the xy plane: a torus of few faces."""
    points, faces = [], []
    for i in range(segments):
        a = 2 * math.pi * i / segments
        c = Vector(center) + Vector((radius * math.cos(a), radius * math.sin(a), 0.0))
        out = Vector((math.cos(a), math.sin(a), 0.0))
        for k in range(sides):
            b = 2 * math.pi * k / sides
            points.append(c + out * (tube * math.cos(b)) + Vector((0.0, 0.0, tube * math.sin(b))))
    for i in range(segments):
        for k in range(sides):
            a, b = i * sides + k, i * sides + (k + 1) % sides
            c_, d = ((i + 1) % segments) * sides + (k + 1) % sides, ((i + 1) % segments) * sides + k
            faces.append((a, b, c_, d))
    ring_points = [
        Vector(center)
        + Vector(
            (
                radius * math.cos(2 * math.pi * i / segments),
                radius * math.sin(2 * math.pi * i / segments),
                0.0,
            )
        )
        for i in range(segments)
    ]
    part.add(
        points,
        faces,
        lambda n, cc: (linear(color), 'matte'),
        lambda c: min(ring_points, key=lambda r: (r - c).length),
    )


def lantern_body(part, bottom, spec):
    """Adds the body of a lantern from a height: a base, posts, glowing glass, a cap, and a roof."""
    w, h, post = spec['width'] / 2, spec['glass'], spec['post']
    y = bottom
    box(part, (-w - 0.01, y, -w - 0.01), (w + 0.01, y + 0.03, w + 0.01), 'iron')
    y += 0.03
    for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        box(
            part,
            (sx * w - post, y, sz * w - post),
            (sx * w + post, y + h, sz * w + post),
            'iron-light',
        )
    inset = w - post * 0.5
    glass = [
        Vector((-inset, y, -inset)),
        Vector((inset, y, -inset)),
        Vector((inset, y, inset)),
        Vector((-inset, y, inset)),
    ]
    glass += [p + Vector((0.0, h, 0.0)) for p in glass]
    faces = [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    c = Vector((0.0, y + h / 2, 0.0))
    part.add(glass, faces, lambda n, cc: (linear('glass'), 'glow'), lambda _: c)
    y += h
    box(part, (-w - 0.012, y, -w - 0.012), (w + 0.012, y + 0.025, w + 0.012), 'iron')
    y += 0.025
    pyramid(part, y, w + 0.045, spec['roof'], 'iron')
    return y + spec['roof']


#: The size of the lanterns, in meters: the width of the body, the height of the glass, the half
#: width of a post, the height of the roof, and the radius of the ring.
LANTERN = {'width': 0.2, 'glass': 0.22, 'post': 0.012, 'roof': 0.09, 'ring': 0.035}


def build_lantern_hanging():
    """Builds the hanging lantern. Its origin is at the top of its ring, where the rope holds it."""
    part = Part('lantern-hanging')
    spec = LANTERN
    top = lantern_body(part, 0.0, spec)
    torus(part, (0.0, top + spec['ring'], 0.0), spec['ring'], 0.008, 8, 4, 'iron')
    lift = top + spec['ring'] * 2 + 0.008
    for v in part.bm.verts:
        v.co.z -= lift
    return part


def build_lantern_branch():
    """Builds a lantern that hangs from a short branch of a tree.

    Its origin is on the axis of the trunk, on the ground, so that the cut of the app keeps it
    with its tree. The branch leaves the trunk toward +x and holds a hook and a hanging lantern.
    """
    part = Part('lantern-branch')
    spec = LANTERN
    height, reach = 3.25, 1.15
    branch(
        part, (0.25, height - 0.35, 0.0), (reach + 0.15, height + 0.1, 0.0), 0.09, 0.035, bend=0.12
    )
    hook = Vector((reach, height + 0.02, 0.0))
    box(part, hook - Vector((0.008, 0.16, 0.008)), hook + Vector((0.008, 0.0, 0.008)), 'iron')
    lantern = Part('lantern-branch-body')
    top = lantern_body(lantern, 0.0, spec)
    torus(lantern, (0.0, top + spec['ring'], 0.0), spec['ring'], 0.008, 8, 4, 'iron')
    lift = top + spec['ring'] * 2 + 0.008
    lantern.bm.verts.ensure_lookup_table()
    drop = hook.y - 0.16 - lift
    moved = [app_point(v.co) + Vector((hook.x, drop, hook.z)) for v in lantern.bm.verts]
    for v, p in zip(lantern.bm.verts, moved):
        v.co = blender_point(p)
    copy_faces(lantern, part)
    lantern.bm.free()
    return part


def copy_faces(source, target):
    """Copies the faces of one part into another, with their colors and their kinds."""
    verts = {v: target.bm.verts.new(v.co) for v in source.bm.verts}
    for f in source.bm.faces:
        g = target.bm.faces.new([verts[v] for v in f.verts])
        g.material_index = f.material_index
        for a, b in zip(f.loops, g.loops):
            b[target.color] = a[source.color]


def build_lantern_standing():
    """Builds the standing lantern, with a wider foot and a ring handle on its roof."""
    part = Part('lantern-standing')
    spec = dict(LANTERN, width=0.24, glass=0.26)
    box(part, (-0.15, 0.0, -0.15), (0.15, 0.04, 0.15), 'iron')
    top = lantern_body(part, 0.04, spec)
    torus(part, (0.0, top + spec['ring'] * 0.8, 0.0), spec['ring'], 0.008, 8, 4, 'iron')
    return part


def scatter_points(rng, center_radius, outer, spacing_near, spacing_far, near):
    """Gives random points in a disc, closer together near the center."""
    points = []
    r = center_radius
    while r < outer:
        spacing = (
            spacing_near
            if r < near
            else spacing_near + (spacing_far - spacing_near) * min(1.0, (r - near) / (outer - near))
        )
        count = max(6, int(2 * math.pi * r / spacing))
        start = rng.uniform(0, 2 * math.pi)
        for k in range(count):
            a = start + 2 * math.pi * (k + rng.uniform(-0.3, 0.3)) / count
            rr = r + rng.uniform(-0.3, 0.3) * spacing
            points.append((rr * math.cos(a), rr * math.sin(a)))
        r += spacing * 0.87
    return points


def build_ground():
    """Builds the forest ground: a faceted disc of earth with patches of moss and litter.

    The disc rises at its rim, so that a far view sees no edge under the trees.
    """
    part = Part('ground')
    rng = part.rng
    outer = 42.0
    flat = scatter_points(rng, 0.8, outer, 1.1, 4.5, 12.0)
    flat = [(0.0, 0.0)] + flat
    rim = [
        (outer * math.cos(2 * math.pi * k / 48), outer * math.sin(2 * math.pi * k / 48))
        for k in range(48)
    ]
    flat = [p for p in flat if math.hypot(*p) < outer - 1.5] + rim
    verts2d, _, faces, _, _, _ = delaunay_2d_cdt([Vector(p) for p in flat], [], [], 0, 1e-4)
    patches = [
        (
            Vector((rng.uniform(-25, 25), rng.uniform(-25, 25))),
            rng.uniform(1.0, 3.2),
            pick(rng, [('litter', 3), ('earth-dark', 3)]),
        )
        for _ in range(60)
    ]
    points = []
    for v in verts2d:
        r = v.length
        rise = 0.0 if r < 16 else 2.2 * ((r - 16) / (outer - 16)) ** 1.6
        points.append(Vector((v.x, GROUND_Y + rng.uniform(-0.03, 0.03) + rise, v.y)))

    def paint(normal, center):
        p = Vector((center.x, center.z))
        for at, radius, name in patches:
            if (p - at).length < radius * rng.uniform(0.8, 1.1):
                return linear(name), 'foliage' if name in ('moss', 'grass') else 'matte'
        r = p.length
        if r < 7.5:
            return linear(pick(rng, [('earth-light', 2), ('earth', 3), ('path', 1)])), 'matte'
        return linear(pick(rng, [('earth', 3), ('earth-dark', 3), ('litter', 2)])), 'matte'

    part.add(points, [tuple(f) for f in faces], paint, 'up')
    return part


def build_path():
    """Builds the path in front of the stage: a strip of lighter earth from the deck to the front.

    Its origin is at the middle of the front edge of the deck, on the ground.
    """
    part = Part('path')
    rng = part.rng
    length = 9.0
    left, right = [], []
    for i in range(10):
        t = i / 9
        z = 0.2 + length * t
        half = 1.5 + 0.6 * t + rng.uniform(-0.15, 0.15)
        bend = 0.6 * math.sin(t * 2.4)
        left.append((bend - half, z))
        right.append((bend + half, z))
    outline = left + list(reversed(right))
    inner = [
        (rng.uniform(-1.0, 1.0) + 0.6 * math.sin(t * 2.4), 0.6 + length * t)
        for t in [i / 12 for i in range(1, 12)]
    ]
    edges = [(i, (i + 1) % len(outline)) for i in range(len(outline))]
    verts2d, _, faces, _, _, _ = delaunay_2d_cdt(
        [Vector(p) for p in outline + inner], edges, [], 2, 1e-4
    )
    points = [Vector((v.x, 0.012 + rng.uniform(0, 0.006), v.y)) for v in verts2d]
    part.add(
        points,
        [tuple(f) for f in faces],
        solid_paint([('path', 3), ('path-light', 2), ('earth-light', 1)], 'matte', rng),
        'up',
    )
    return part


#: The place of the stream part: the x and the z of the foot of the waterfall, and the yaw in
#: degrees, which turns the fall to the default camera. The fall stands behind the back right
#: corner of the deck, so that the default view shows it at the height of the heads of the back
#: row, as `forest.webp`.
STREAM_PLACE = (5.0, -5.6, -15.0)

#: The middle line of the stream in the axes of the app, from the pool at the foot of the
#: waterfall: the water runs toward the back right corner of the deck, then turns to the right
#: (+x) and goes under the bushes at the right side of the stage.
STREAM_COURSE = (
    (4.98, -5.15),
    (4.86, -4.7),
    (4.98, -4.25),
    (5.45, -3.92),
    (6.3, -3.72),
    (7.3, -3.5),
    (8.4, -3.1),
    (9.6, -2.6),
)

#: The half width of the water of the stream, in meters, at the pool and further down.
STREAM_HALF = (0.55, 0.36)

#: The two steps of the waterfall in the axes of the part: the height of the lip, the height of
#: the foot, the z of the lip, the reach of the water past the lip, and the half width of the
#: water.
FALL_STEPS = (
    (0.62, 0.34, -0.55, 0.1, 0.2),
    (0.34, 0.045, -0.18, 0.14, 0.3),
)


def stream_local(x, z):
    """Turns a point of the ground in the axes of the app into the axes of the stream part."""
    sx, sz, yaw = STREAM_PLACE
    a = math.radians(yaw)
    dx, dz = x - sx, z - sz
    # The place turns a local point by the yaw: x = lx cos + lz sin, z = lz cos - lx sin.
    return dx * math.cos(a) - dz * math.sin(a), dx * math.sin(a) + dz * math.cos(a)


def stream_world(lx, lz):
    """Turns a point of the ground in the axes of the stream part into the axes of the app."""
    sx, sz, yaw = STREAM_PLACE
    a = math.radians(yaw)
    return sx + lx * math.cos(a) + lz * math.sin(a), sz + lz * math.cos(a) - lx * math.sin(a)


def build_stream():
    """Builds the small waterfall of two steps between dark, wet rocks, and its stream.

    Its origin is at the foot of the waterfall, on the ground. The water falls toward +z in
    strands with foam, onto a ledge and into a pool, and the stream runs from the pool along
    `STREAM_COURSE`, with glints and bank stones.
    """
    part = Part('stream')
    rng = part.rng
    wet = solid_paint([('rock-wet', 3), ('rock-wet-dark', 2), ('rock-dark', 1)], 'matte', rng)
    dry = solid_paint([('rock', 3), ('rock-warm', 2), ('rock-light', 1)], 'matte', rng)

    def rock(center, size, count=12, moss=0.0):
        """Adds a boulder: wet, dark sides, and a dry top with some moss."""
        pts = []
        for _ in range(count):
            d = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1))).normalized()
            pts.append(Vector(center) + Vector((d.x * size[0], d.y * size[1], d.z * size[2])))
        pts, faces = hull(pts)
        c = sum(pts, Vector()) / len(pts)

        def rock_paint(normal, center):
            if normal.y > 0.55:
                if rng.random() < moss:
                    return linear(pick(rng, [('moss', 2), ('leaf-dark', 1)])), 'matte'
                return dry(normal, center)
            return wet(normal, center)

        part.add(pts, faces, rock_paint, lambda _: c)

    def slab(lo, hi, count=10):
        """Adds a rock of random points in a box: the dark face behind a step of the fall.

        A point near each front corner keeps the face as wide and as high as the water.
        """
        pts = [Vector(tuple(rng.uniform(lo[i], hi[i]) for i in range(3))) for _ in range(count)]
        for x, y in ((lo[0], lo[1]), (hi[0], lo[1]), (lo[0], hi[1]), (hi[0], hi[1])):
            pts.append(Vector((x, y, hi[2] - rng.uniform(0.0, 0.03))))
        pts, faces = hull(pts)
        c = sum(pts, Vector()) / len(pts)
        part.add(pts, faces, wet, lambda _: c)

    def disc(center, radii, sides, names, lift=0.0):
        """Adds a flat fan of water faces that look up."""
        pts = [Vector(center) + Vector((0.0, lift, 0.0))]
        start = rng.uniform(0, 1)
        for k in range(sides):
            a = start + 2 * math.pi * k / sides
            r = rng.uniform(0.82, 1.08)
            pts.append(
                Vector(center)
                + Vector((radii[0] * r * math.cos(a), 0.0, radii[1] * r * math.sin(a)))
            )
        faces = [(0, 1 + (k + 1) % sides, 1 + k) for k in range(sides)]
        part.add(pts, faces, lambda n, c: (linear(pick(rng, names)), 'water'), 'up')

    # The rocks: flat boulders behind the top of the fall and at each side of each step, and the
    # dark faces behind the strands, so that the rock shows between them.
    rock((0.0, 0.45, -1.3), (1.0, 0.45, 0.5), 16, moss=0.4)
    rock((-0.85, 0.3, -0.85), (0.45, 0.36, 0.42), 12, moss=0.3)
    rock((0.9, 0.32, -0.8), (0.48, 0.38, 0.4), 12, moss=0.3)
    for top, _, z, _, half in FALL_STEPS:
        for side in (-1, 1):
            rock(
                (side * (half + 0.22 + rng.uniform(0.0, 0.06)), top * 0.55, z - 0.02),
                (0.3, top * 0.55, 0.3),
                11,
                moss=0.2,
            )
    for top, foot, z, _, half in FALL_STEPS:
        slab((-half - 0.06, foot - 0.04, z - 0.16), (half + 0.06, top - 0.02, z - 0.04))

    # The water: the pool above the fall, a sheet over each step, and the foam at each foot. Each
    # sheet curves over its lip in columns of uneven widths with no gap, in tones of cream with
    # streaks. Strands of uneven widths and lengths lie over the sheet, so that the streaks
    # overlap, as the warm, soft water of `forest.webp`.
    disc((0.0, FALL_STEPS[0][0] + 0.01, -0.85), (0.3, 0.22), 7, [('water', 2), ('water-cream', 1)])
    tones = [('water-cream', 3), ('water-streak', 2), ('water-cream-light', 2)]
    for top, foot, z, reach, half in FALL_STEPS:
        drop = top - foot

        def sheet_point(x, sv, front=0.0, top=top, z=z, reach=reach, drop=drop):
            """Gives a point of the sheet: over the round lip first, then down and out."""
            if sv < 0:
                return Vector((x, top + 0.008, z - 0.07 + front))
            return Vector((x, top - drop * sv, z + reach * math.sqrt(sv) + 0.015 + front))

        lip = [Vector((-half, top + 0.008, z - 0.14)), Vector((half, top + 0.008, z - 0.14))]
        lip += [sheet_point(half, -1), sheet_point(-half, -1)]
        part.add(lip, [(0, 1, 2, 3)], lambda n, c: (linear('water-cream'), 'water'), 'up')
        rows_at = (-1, 0.0, 0.12, 0.4, 0.7, 1.0)
        cuts = sorted(rng.uniform(-half * 0.9, half * 0.9) for _ in range(6))
        columns = list(zip([-half] + cuts, cuts + [half]))
        for x0, x1 in columns:
            tone = pick(rng, tones)
            end = rng.uniform(0.86, 1.0)
            pts = []
            for sv in rows_at:
                sv = sv if sv < 0 else sv * end
                pts += [sheet_point(x0, sv), sheet_point(x1, sv)]
            faces = [(2 * r, 2 * r + 1, 2 * r + 3, 2 * r + 2) for r in range(len(rows_at) - 1)]

            def sheet_paint(normal, center, tone=tone, top=top, drop=drop):
                share = (top - center.y) / drop
                return linear('foam' if share > 0.8 else tone), 'water'

            part.add(pts, faces, sheet_paint, lambda c, z=z: Vector((c.x, c.y, z - 1.0)))
        for _ in range(6):
            width = rng.uniform(0.03, 0.09)
            x0 = rng.uniform(-half, half - width)
            length = rng.uniform(0.55, 1.0)
            tone = pick(rng, [('water-cream-light', 2), ('water-streak', 1)])
            pts = []
            for sv in (-1, 0.0, 0.12, length * 0.5, length):
                pts += [sheet_point(x0, sv, 0.012), sheet_point(x0 + width, sv, 0.012)]
            faces = [(2 * r, 2 * r + 1, 2 * r + 3, 2 * r + 2) for r in range(4)]
            part.add(
                pts,
                faces,
                lambda n, c, tone=tone: (linear(tone), 'water'),
                lambda c, z=z: Vector((c.x, c.y, z - 1.0)),
            )
        # The foam pool at the foot: a wide, uneven fan of foam and cream.
        disc(
            (0.0, foot, z + reach + 0.1),
            (half + 0.12, 0.16),
            9,
            [('foam', 3), ('water-cream', 2)],
            0.015,
        )

    # The stream: a strip of dark water from the pool along the course, with small glints of the
    # low sun, and stones on its banks.
    course = [stream_local(x, z) for x, z in STREAM_COURSE]
    course.insert(0, (0.0, 0.18))
    left, right = [], []
    for i, (x, z) in enumerate(course):
        a = course[min(i + 1, len(course) - 1)]
        b = course[max(i - 1, 0)]
        d = Vector((a[0] - b[0], a[1] - b[1])).normalized()
        n = Vector((-d.y, d.x))
        half = (STREAM_HALF[0] if i < 2 else STREAM_HALF[1]) + rng.uniform(-0.04, 0.05)
        left.append((x + n.x * half, z + n.y * half))
        right.append((x - n.x * half, z - n.y * half))
    middle = [(x + rng.uniform(-0.08, 0.08), z) for x, z in course[1:-1]]
    outline = left + list(reversed(right))
    edges = [(i, (i + 1) % len(outline)) for i in range(len(outline))]
    verts2d, _, faces, _, _, _ = delaunay_2d_cdt(
        [Vector(p) for p in outline + middle], edges, [], 2, 1e-4
    )
    pts = [Vector((v.x, 0.045, v.y)) for v in verts2d]
    part.add(
        pts,
        [tuple(f) for f in faces],
        lambda n, c: (linear(pick(rng, [('water', 3), ('water-deep', 2)])), 'water'),
        'up',
    )
    # The glints: many tiny gold triangles just above the water, more of them near the fall.
    for i in range(len(course) - 1):
        (ax, az), (bx, bz) = course[i], course[i + 1]
        d = Vector((bx - ax, bz - az)).normalized()
        n = Vector((-d.y, d.x))
        for _ in range(14 if i < 3 else 5):
            t = rng.uniform(0.0, 1.0)
            cx, cz = ax + (bx - ax) * t, az + (bz - az) * t
            off = rng.uniform(-0.7, 0.7) * (STREAM_HALF[1] if i > 0 else STREAM_HALF[0])
            c = Vector((cx + n.x * off, 0.05, cz + n.y * off))
            size = rng.uniform(0.01, 0.022)
            a0 = rng.uniform(0, 2 * math.pi)
            tri = [
                c + Vector((size * math.cos(a0 + k * 2.1), 0.0, size * math.sin(a0 + k * 2.1)))
                for k in range(3)
            ]
            part.add(tri, [(0, 1, 2)], lambda n, c: (linear('water-glint'), 'water'), 'up')
    for i in range(len(course)):
        for edge in (left, right):
            if i > 0 and rng.random() < 0.3:
                continue
            p = edge[i]
            size = rng.uniform(0.12, 0.26) * (1.3 if i < 2 else 1.0)
            rock(
                (p[0] + rng.uniform(-0.06, 0.06), size * 0.25, p[1] + rng.uniform(-0.12, 0.12)),
                (size, size * 0.6, size * 0.85),
                9,
                0.3,
            )
    return part


#: The forms of the large trees: the trunk height and radius, the taper, the flare of the roots,
#: the root count, the lean (x, z), the twist, the branch count and reach, the crown blob size,
#: and the blob count.
TREES = {
    'tree-1': {
        'trunk': 11.0,
        'radius': 0.56,
        'taper': 0.3,
        'flare': 0.45,
        'roots': 5,
        'lean': (0.3, -0.2),
        'twist': 0.04,
        'branches': 4,
        'reach': 3.4,
        'crown': 2.3,
        'blobs': 10,
        'boughs': ((5.6, 40, 3.6),),
    },
    'tree-2': {
        'trunk': 12.5,
        'radius': 0.52,
        'taper': 0.32,
        'flare': 0.45,
        'roots': 5,
        'lean': (-0.2, 0.15),
        'twist': -0.03,
        'branches': 4,
        'reach': 3.0,
        'crown': 2.2,
        'blobs': 9,
    },
    'tree-3': {
        'trunk': 9.5,
        'radius': 0.46,
        'taper': 0.3,
        'flare': 0.7,
        'roots': 4,
        'lean': (0.6, 0.2),
        'twist': 0.06,
        'branches': 3,
        'reach': 3.2,
        'crown': 2.1,
        'blobs': 9,
        'light': 0.05,
        'boughs': ((5.4, 150, 3.0),),
    },
    'tree-4': {
        'trunk': 10.5,
        'radius': 0.38,
        'taper': 0.35,
        'flare': 0.55,
        'roots': 4,
        'lean': (-0.3, -0.3),
        'twist': 0.05,
        'branches': 3,
        'reach': 2.6,
        'crown': 1.9,
        'blobs': 8,
    },
}


def build_parts(collection):
    """Builds each part of the kit into the collection, and gives the objects by name."""
    parts = [build_tree(name, spec) for name, spec in TREES.items()]
    parts += [
        build_far_tree(
            'tree-far', {'trunk': 7.0, 'radius': 0.3, 'crown': 1.9, 'blobs': 4, 'detail': 'low'}
        ),
        build_conifer('conifer', {'height': 9.0, 'radius': 0.22, 'spread': 1.9, 'tiers': 4}),
        build_canopy('canopy-1', {'length': 3.2, 'drop': 0.8, 'blobs': 5, 'size': 1.1}),
        build_canopy('canopy-2', {'length': 2.4, 'drop': 0.5, 'blobs': 4, 'size': 0.9}),
        build_bush('bush-1', {'blobs': 4, 'size': 0.6}),
        build_bush('bush-2', {'blobs': 3, 'size': 0.45}),
        build_bush('bush-3', {'blobs': 3, 'size': 0.8, 'fine': True}),
        build_fern(
            'fern-1',
            {'fronds': 8, 'length': 1.1, 'rise': 0.5, 'droop': 0.4, 'leaflets': 9, 'width': 0.17},
        ),
        build_fern(
            'fern-2',
            {'fronds': 6, 'length': 0.8, 'rise': 0.55, 'droop': 0.2, 'leaflets': 8, 'width': 0.13},
        ),
        build_grass('grass', {'blades': 8, 'spread': 0.08, 'height': 0.32, 'width': 0.025}),
        build_moss('moss', {'radius': 0.55, 'height': 0.06}),
        build_rock('rock-1', {'size': (0.75, 0.75, 0.6), 'points': 18, 'moss': 0.5}),
        build_rock('rock-2', {'size': (0.55, 0.35, 0.45), 'points': 14, 'moss': 0.3}),
        build_rock('rock-3', {'size': (0.3, 0.26, 0.26), 'points': 11}),
        build_log('log', {'length': 2.3, 'radius': 0.27}),
        build_rock(
            'rock-4',
            {
                'size': (0.6, 0.5, 0.5),
                'points': 16,
                'moss': 0.2,
                'tones': ('rock-blue-light', 'rock-blue', 'rock-blue-dark'),
            },
        ),
        build_stump('stump-1', {'height': 0.55, 'radius': 0.4}),
        build_stump('stump-2', {'height': 0.45, 'radius': 0.34}),
        build_lantern_hanging(),
        build_lantern_standing(),
        build_lantern_branch(),
        build_ground(),
        build_path(),
        build_stream(),
    ]
    return {part.name: part.finish(collection) for part in parts}


#: The half side of the stage of the default demo, and its corner cut, in meters.
HALF = STAGE_SIDE / 2
CUT = STAGE_CORNER_CUT * STAGE_SIDE

#: The most triangles of all placed parts around the stage of the default demo, with the lanterns
#: of the light string.
TRIANGLE_BUDGET = 50000

#: The least space between the deck edge and the trunk with its roots, in meters.
TREE_CLEARANCE = 1.5

#: The least space between the deck edge and the roots of the two framing trees, in meters. The
#: default view stands close to the deck, so a trunk with 1.5 m of space showed only at the frame
#: edges. With this space, the trunks frame the left and the right of the view, as in the
#: reference, and the players at the deck edge keep a free side.
FRAME_CLEARANCE = 0.4

#: The indices in `PLACES` of the two framing trees.
FRAME_TREES = (0, 1)

#: The least space between the deck edge and a low part of the scatter, in meters, so that no
#: frond or leaf comes over the deck.
LOW_CLEARANCE = 0.05

#: The hand-placed parts around the stage of the default demo: the part, x, z, the yaw in degrees,
#: the scale, and the height of the origin above the ground. The yaw of a tree turns it from the
#: yaw that faces the gap of its roots to the deck (`facing_yaw()`). The scatter of `scatter()`
#: adds the small parts and the trees of the back rows.
PLACES = [
    # The large trees. The near trees beside the front half of the deck frame the default view,
    # the trees behind the deck hold the light string, and the others stand around the stage.
    ('tree-1', -6.0, -0.4, 0, 1.0, 0.0),
    ('tree-2', 6.1, -1.0, 0, 1.0, 0.0),
    ('tree-3', -6.3, -6.5, 0, 0.95, 0.0),
    ('tree-2', -1.3, -6.9, 0, 0.9, 0.0),
    ('tree-4', 7.2, -6.6, 0, 1.0, 0.0),
    ('tree-4', -9.8, -3.2, 40, 1.05, 0.0),
    ('tree-3', 11.2, 2.4, -40, 0.95, 0.0),
    ('tree-1', 3.4, -10.6, 30, 0.95, 0.0),
    ('tree-2', -5.2, -11.6, -30, 0.9, 0.0),
    ('tree-4', 12.6, -9.4, 20, 0.95, 0.0),
    ('tree-3', -12.0, -8.6, -20, 1.0, 0.0),
    ('tree-1', -11.4, 5.4, 60, 0.95, 0.0),
    ('tree-4', 12.2, 6.2, -60, 1.0, 0.0),
    # The low boughs from the framing trees over the top corners of the default view, and the
    # lantern on a branch of the left framing tree.
    ('canopy-1', -6.0, -0.4, -70, 1.0, 4.4),
    ('canopy-2', 6.1, -1.0, -120, 1.0, 4.3),
    ('lantern-branch', -6.0, -0.4, -10, 1.0, 0.0),
    # The stumps with their lanterns at the front corners, the log and the rocks in front.
    ('stump-1', -4.6, 4.3, 0, 1.0, 0.0),
    ('lantern-standing', -4.6, 4.3, 15, 1.0, 0.55),
    ('stump-2', 4.75, 4.45, 40, 1.0, 0.0),
    ('lantern-standing', 4.75, 4.45, -20, 1.0, 0.45),
    # The log lies at an angle at the lower left, with its thick cut end to the front right and
    # its far end in the bushes at the left, and keeps a gap of earth to the deck front. The dark
    # rocks stand in a group at the right.
    ('log', -2.15, 5.0, 165, 1.0, 0.0),
    ('rock-4', 2.45, 5.05, 20, 1.0, 0.0),
    ('rock-4', 3.25, 4.85, 140, 0.7, 0.0),
    ('rock-4', 2.95, 5.55, 260, 0.55, 0.0),
    ('rock-3', 1.85, 5.3, 0, 1.0, 0.0),
    ('rock-1', -8.0, -4.8, 70, 1.3, 0.0),
    ('rock-2', -4.6, -6.0, 10, 1.3, 0.0),
    ('rock-1', 2.2, -6.3, 160, 1.0, 0.0),
    # The ground, the path, and the stream with its waterfall at the back right.
    ('ground', 0.0, 0.0, 0, 1.0, 0.0),
    ('path', 0.0, HALF, 0, 1.0, 0.0),
    ('stream', *STREAM_PLACE, 1.0, 0.0),
]

#: The undergrowth along the back edge of the deck: a row of bushes near the edge and a row of
#: ferns and bushes behind it, from the left corner to the waterfall. The part, x, and z in
#: meters.
BACK_UNDERGROWTH = (
    ('bush-2', -4.3, -5.05),
    ('bush-1', -3.2, -5.3),
    ('bush-2', -2.1, -5.0),
    ('bush-1', -0.95, -5.3),
    ('bush-2', 0.2, -5.0),
    ('bush-1', 1.35, -5.3),
    ('bush-2', 2.45, -5.0),
    ('bush-2', 3.45, -5.05),
    ('fern-2', -3.75, -6.2),
    ('bush-2', -1.6, -6.3),
    ('fern-2', 0.75, -6.25),
    ('bush-2', 2.95, -6.2),
)

#: The grass tufts of the clearing in front of the deck: x and z in meters.
FRONT_GRASS = (
    (-2.3, 4.55),
    (-1.0, 4.62),
    (-0.2, 4.95),
    (0.35, 4.6),
    (0.9, 5.15),
    (1.45, 4.7),
    (0.2, 5.45),
    (-0.4, 5.75),
    (2.05, 4.55),
    (1.6, 5.7),
    (-2.9, 5.6),
    (3.7, 4.55),
)

#: The ropes of the light string: the two trees (indices in `PLACES`), the height of each end
#: above the ground, the slack, and the lantern count. The ropes from the framing trees to the
#: trees behind the deck hold the sides of the string. The default view sees nothing above about
#: 2 m behind the deck, so the rope between the framing trees crosses the top of the view.
ROPES = [
    (0, 2, 3.8, 3.2, 0.02, 3),
    (2, 3, 3.2, 3.0, 0.02, 2),
    (3, 4, 3.0, 3.1, 0.02, 2),
    (4, 1, 3.1, 3.8, 0.02, 3),
    (0, 1, 3.7, 3.7, 0.012, 4),
]


#: The parts with a trunk: they keep TREE_CLEARANCE from the deck edge.
TALL_PARTS = (*TREES, 'tree-far', 'conifer')


def facing_yaw(x, z):
    """Gives the yaw in degrees that turns the angle 0 of a part at a place to the stage center."""
    return math.degrees(-math.atan2(-z, -x))


def clearance(obj, x, z, yaw, scale, top=0.4):
    """Gives the least distance outside the deck edge of the points of a part below a height.

    The default height of 0.4 m measures the trunk and the roots of a tree, and not its crown.
    """
    a = math.radians(yaw)
    least = math.inf
    for v in obj.data.vertices:
        p = app_point(v.co)
        if -0.05 <= p.y <= top:
            wx = x + (p.x * math.cos(a) + p.z * math.sin(a)) * scale
            wz = z + (p.z * math.cos(a) - p.x * math.sin(a)) * scale
            least = min(least, deck_distance(wx, wz))
    return least


def deck_distance(x, z, half=HALF, cut=CUT):
    """Gives the distance of a point outside the deck outline, or a negative value inside.

    The value is the largest distance from the lines of the edges and of the corner cuts. It is
    at most the true distance, so a rule that uses it keeps at least its space.
    """
    return max(abs(x) - half, abs(z) - half, (abs(x) + abs(z) - (2 * half - cut)) / math.sqrt(2))


def view_point(p):
    """Gives the place of a point in the default view, from -1 to 1 on each axis, and its depth."""
    eye = Vector(CAMERA['position'])
    forward = (Vector(CAMERA['target']) - eye).normalized()
    right = forward.cross(Vector((0.0, 1.0, 0.0))).normalized()
    up = right.cross(forward)
    d = Vector(p) - eye
    depth = d.dot(forward)
    t = math.tan(math.radians(CAMERA['fov']) / 2)
    return d.dot(right) / (depth * t * ASPECT), d.dot(up) / (depth * t), depth


def in_front_view(x, z, height):
    """Finds if a part at a place in front of the stage shows in the default view."""
    if z < HALF - 1.0:
        return False
    for y in (GROUND_Y, GROUND_Y + height):
        u, v, depth = view_point((x, y, z))
        if depth > 0 and abs(u) < 1.05 and abs(v) < 1.05:
            return True
    return False


def in_front_opening(x, z):
    """Finds if a place is in the opening in front of the stage, where no tree stands."""
    return z > HALF - 1.0 and abs(x) < HALF + 1.0 + (z - HALF) * 0.7


#: The least space between the water of the stream and the foot of a part of the scatter, in
#: meters.
STREAM_KEEP = 0.9


def stream_course(places):
    """Gives points along the water of the placed stream and its fall, in the axes of the app."""
    return [stream_world(0.0, z) for z in (-1.2, -0.6, 0.0)] + list(STREAM_COURSE)


def scatter(rng, objects, footprints):
    """Gives the places of the kit: the hand-placed parts of `PLACES`, and the small parts and the
    trees of the back rows at random places, with the rules of the composition.

    `footprints` gives the radius of each part at the ground, so that two parts do not overlap. A
    part with a trunk keeps `TREE_CLEARANCE` from the deck edge, and no part with a trunk or a
    bush stands in the opening in front of the stage.
    """
    places = []
    for i, (part, x, z, yaw, scale, lift) in enumerate(PLACES):
        if part in TALL_PARTS:
            yaw = facing_yaw(x, z) + yaw
            space = clearance(objects[part], x, z, yaw, scale)
            if space < (FRAME_CLEARANCE if i in FRAME_TREES else TREE_CLEARANCE):
                raise ValueError(f'{part} at ({x}, {z}) stands {space:.2f} m from the deck edge.')
        places.append((part, x, z, round(yaw, 1), scale, lift))
    water = stream_course(places)
    for part, x, z, _, scale, _ in places:
        near = min(math.hypot(x - wx, z - wz) for wx, wz in water)
        if part in TALL_PARTS and near < STREAM_KEEP + footprints[part] * scale:
            raise ValueError(f'{part} at ({x}, {z}) stands in the stream.')
    taken = [
        (p[1], p[2], footprints[p[0]] * p[4])
        for p in places
        if p[0] not in ('ground', 'path', 'stream') and p[5] == 0.0
    ]

    def free(x, z, radius, gap):
        if min(math.hypot(x - wx, z - wz) for wx, wz in water) < STREAM_KEEP + radius:
            return False
        if -2.6 < x < 2.8 and HALF < z < HALF + 9.5:
            return False
        return all(math.hypot(x - tx, z - tz) > radius + tr + gap for tx, tz, tr in taken)

    def place(part, x, z, scale, yaw):
        places.append((part, round(x, 3), round(z, 3), round(yaw, 1), round(scale, 3), 0.0))
        taken.append((x, z, footprints[part] * scale))

    def ring_point(near, far):
        for _ in range(60):
            a = rng.uniform(0, 2 * math.pi)
            r = rng.uniform(HALF, HALF + far + 4)
            x, z = r * math.sin(a), r * math.cos(a)
            if near <= deck_distance(x, z) <= far:
                return x, z
        return None

    def fill(choices, count, near, far, scales, tall):
        tries = 0
        while count > 0 and tries < count * 80:
            tries += 1
            name = choices if isinstance(choices, str) else pick(rng, choices)
            point = ring_point(near, far)
            scale = rng.uniform(*scales)
            if not point:
                continue
            x, z = point
            if tall and (in_front_opening(x, z) or in_front_view(x, z, tall)):
                continue
            trunk = name in TALL_PARTS
            yaw = facing_yaw(x, z) + rng.uniform(-30, 30) if trunk else rng.uniform(0, 360)
            if not free(x, z, footprints[name] * scale, 0.6 if trunk else -0.15):
                continue
            if trunk and clearance(objects[name], x, z, yaw, scale) < TREE_CLEARANCE:
                continue
            if clearance(objects[name], x, z, yaw, scale, 3.0) < LOW_CLEARANCE:
                continue
            place(name, x, z, scale, yaw)
            count -= 1

    def clusters(choices, count, size, near, far, scales, back=False):
        for _ in range(count):
            point = ring_point(near, far)
            if not point or in_front_opening(*point) or in_front_view(point[0], point[1], 1.2):
                continue
            if back and point[1] > -HALF:
                continue
            for k in range(size):
                a = rng.uniform(0, 2 * math.pi)
                d = rng.uniform(0.5, 1.6) if k else 0.0
                x, z = point[0] + d * math.cos(a), point[1] + d * math.sin(a)
                name = pick(rng, choices)
                scale = rng.uniform(*scales)
                if deck_distance(x, z) < 0.3 or in_front_view(x, z, 1.2):
                    continue
                # The members of a cluster may touch: the test takes 40 % of each footprint.
                yaw = rng.uniform(0, 360)
                if not free(x, z, footprints[name] * scale * 0.4, -0.6 * footprints[name] * scale):
                    continue
                if clearance(objects[name], x, z, yaw, scale, 3.0) >= LOW_CLEARANCE:
                    place(name, x, z, scale, yaw)

    fill([('tree-far', 3), ('conifer', 2)], 26, 5.5, 17.0, (0.85, 1.2), 9.0)
    clusters(
        [('bush-1', 3), ('bush-2', 3), ('bush-3', 2), ('fern-1', 2), ('fern-2', 2)],
        30,
        5,
        0.6,
        4.5,
        (0.7, 1.15),
    )
    # The undergrowth behind the deck: the default view sees the ground there up to about 12 m
    # behind the deck, below the crowns.
    clusters(
        [('bush-2', 3), ('bush-1', 1), ('fern-1', 2), ('fern-2', 3)],
        40,
        4,
        4.5,
        12.0,
        (0.8, 1.3),
        back=True,
    )
    fill([('fern-1', 1), ('fern-2', 1)], 24, 0.2, 5.0, (0.8, 1.25), 0.0)
    fill([('rock-2', 1), ('rock-3', 2)], 14, 0.6, 8.0, (0.7, 1.3), 0.0)
    fill('grass', 46, 0.2, 9.0, (0.8, 1.4), 0.0)
    fill('moss', 16, 0.4, 10.0, (0.8, 1.4), 0.0)
    # The low parts at the bottom of the default view, near the camera.
    for name, x, z in (
        ('bush-2', -6.4, 6.6),
        ('bush-1', 6.9, 6.4),
        ('fern-1', -3.6, 5.6),
        ('fern-2', 1.2, 5.5),
        ('fern-1', 4.0, 5.3),
        ('fern-2', -5.2, 3.6),
        ('bush-1', -4.15, 5.2),
        ('bush-2', 3.85, 5.5),
    ):
        yaw = rng.uniform(0, 360)
        space = clearance(objects[name], x, z, yaw, 1.0, 3.0)
        if space < LOW_CLEARANCE:
            raise ValueError(f'{name} at ({x}, {z}) comes {-space:.2f} m over the deck edge.')
        place(name, x, z, 1.0, yaw)
    # The undergrowth along the back edge of the deck, where the default view saw bare earth.
    for name, x, z in BACK_UNDERGROWTH:
        yaw = rng.uniform(0, 360)
        scale = rng.uniform(0.9, 1.15)
        space = clearance(objects[name], x, z, yaw, scale, 3.0)
        if space < LOW_CLEARANCE:
            raise ValueError(f'{name} at ({x}, {z}) comes {-space:.2f} m over the deck edge.')
        place(name, x, z, scale, yaw)
    # The grass tufts of the clearing in front of the deck, beside and behind the log.
    for x, z in FRONT_GRASS:
        place('grass', x, z, rng.uniform(0.8, 1.1), rng.uniform(0, 360))
    return places


def footprint(obj):
    """Gives the largest distance from the axis of a part to its points from 0 to 0.4 m high."""
    radius = 0.0
    for v in obj.data.vertices:
        p = app_point(v.co)
        if -0.05 <= p.y <= 0.4:
            radius = max(radius, math.hypot(p.x, p.z))
    return radius


def place_empties(collection, places, objects):
    """Adds one empty for each place, with the part name, and the empties of the rope ends."""
    empties = []
    for i, (part, x, z, yaw, scale, lift) in enumerate(places):
        empty = bpy.data.objects.new(f'{i:03d}-{part}', None)
        empty.location = blender_point((x, GROUND_Y + lift, z))
        empty.rotation_euler = (0.0, 0.0, math.radians(yaw))
        empty.scale = (scale, scale, scale)
        empty['part'] = part
        collection.objects.link(empty)
        empties.append(empty)
    for r, (a, b, ya, yb, slack, lanterns) in enumerate(ROPES):
        for end, (tree, other, y) in enumerate(((a, b, ya), (b, a, yb))):
            parent, target = places[tree], places[other]
            toward = Vector((target[1] - parent[1], 0.0, target[2] - parent[2])).normalized()
            reach = trunk_radius(objects[parent[0]], y / parent[4]) * parent[4] * 0.9
            world = Vector((parent[1], GROUND_Y + y, parent[2])) + toward * reach
            # The end is a child of the empty of its tree, so its place is in the axes of the
            # tree: the move from the tree, turned back by the yaw and divided by the scale.
            yaw = math.radians(parent[3])
            move = world - Vector((parent[1], GROUND_Y + parent[5], parent[2]))
            local = (
                Vector(
                    (
                        move.x * math.cos(yaw) - move.z * math.sin(yaw),
                        move.y,
                        move.x * math.sin(yaw) + move.z * math.cos(yaw),
                    )
                )
                / parent[4]
            )
            empty = bpy.data.objects.new(f'rope-{r}-{end}', None)
            collection.objects.link(empty)
            empty.parent = empties[tree]
            empty.location = blender_point(local)
            empty['rope'] = r
            empty['end'] = end
            empty['slack'] = slack
            empty['lanterns'] = lanterns
    stage = bpy.data.objects.new('stage', None)
    stage['side'] = STAGE_SIDE
    collection.objects.link(stage)
    return empties


def trunk_radius(obj, y):
    """Gives the mean distance from the axis of a part to its matte points near a height."""
    near = [app_point(v.co) for v in obj.data.vertices if abs(app_point(v.co).y - y) < 0.9]
    if not near:
        return 0.3
    return sum(math.hypot(p.x, p.z) for p in near) / len(near)


def catenary(a, b, slack, count):
    """Gives points of a rope that hangs between two points, with a length of (1 + slack) times
    the distance between them.

    The curve is y = k cosh((s - s0) / k) + c over the distance s along the ground. A bisection
    finds k, and `ropes` of `src/models/forest/kit.ts` uses the same steps.
    """
    a, b = Vector(a), Vector(b)
    flat = Vector((b.x - a.x, 0.0, b.z - a.z))
    span = flat.length
    rise = b.y - a.y
    length = (b - a).length * (1 + slack)
    target = math.sqrt(length * length - rise * rise)
    lo, hi = span * 1e-3, span * 1e4
    for _ in range(80):
        k = math.sqrt(lo * hi)
        if 2 * k * math.sinh(span / (2 * k)) > target:
            lo = k
        else:
            hi = k
    k = math.sqrt(lo * hi)
    s0 = span / 2 - k * math.asinh(rise / (2 * k * math.sinh(span / (2 * k))))
    c = a.y - k * math.cosh(-s0 / k)
    out = []
    for i in range(count + 1):
        t = i / count
        s = span * t
        p = a + flat * t
        out.append(Vector((p.x, k * math.cosh((s - s0) / k) + c, p.z)))
    return out


def clear_scene():
    """Removes each object, mesh, material, and collection of the scene."""
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj)
    for data in (
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.curves,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for item in list(data):
            data.remove(item)
    for coll in list(bpy.data.collections):
        bpy.data.collections.remove(coll)


#: The rope of the light string in the preview: its radius in meters and its color.
ROPE = {'radius': 0.014, 'color': '#6b5236'}


def preview_material(name, color, strength=0.0):
    """Gives a plain material of the preview renders."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    rgb = (*color, 1.0)
    bsdf.inputs['Base Color'].default_value = rgb
    bsdf.inputs['Roughness'].default_value = 0.6
    if strength:
        bsdf.inputs['Emission Color'].default_value = rgb
        bsdf.inputs['Emission Strength'].default_value = strength
    return mat


def stage_proxy(collection):
    """Adds the stage of the default demo: the octagon slab with its top at 0."""
    h, c = HALF, CUT
    outline = [
        (-h + c, h),
        (h - c, h),
        (h, h - c),
        (h, -h + c),
        (h - c, -h),
        (-h + c, -h),
        (-h, -h + c),
        (-h, h - c),
    ]
    bm = bmesh.new()
    top = [bm.verts.new(blender_point((x, 0.0, z))) for x, z in outline]
    bottom = [bm.verts.new(blender_point((x, -STAGE_THICKNESS, z))) for x, z in outline]
    bm.faces.new(top)
    bm.faces.new(list(reversed(bottom)))
    for i in range(8):
        j = (i + 1) % 8
        bm.faces.new((bottom[i], bottom[j], top[j], top[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    mesh = bpy.data.meshes.new('stage-proxy')
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(preview_material('stage-proxy', (0.42, 0.17, 0.06)))
    obj = bpy.data.objects.new('stage-proxy', mesh)
    collection.objects.link(obj)
    return obj


def rope_points(empties):
    """Gives the ends, the slack, and the lantern count of each rope, from the empties."""
    ropes = {}
    for obj in empties:
        if 'rope' in obj:
            r = ropes.setdefault(obj['rope'], [None, None, obj['slack'], obj['lanterns']])
            r[obj['end']] = app_point(obj.matrix_world.translation)
    return [ropes[k] for k in sorted(ropes)]


def build_preview(objects, empties):
    """Adds a copy of each part at each place, the ropes with their lanterns, the stage proxy, the
    camera of the default view, and a warm low sun from the back right."""
    bpy.context.view_layer.update()
    preview = bpy.data.collections.new('forest-preview')
    bpy.context.scene.collection.children.link(preview)
    for obj in objects.values():
        obj.hide_render = True
        obj.hide_viewport = True
    for empty in empties:
        if 'part' not in empty:
            continue
        copy = bpy.data.objects.new(f'copy-{empty.name}', objects[empty['part']].data)
        copy.matrix_world = empty.matrix_world
        preview.objects.link(copy)
    rope_mat = preview_material('rope', linear_hex(ROPE['color']))
    lantern = objects['lantern-hanging'].data
    for i, (a, b, slack, lanterns) in enumerate(rope_points(empties)):
        curve = bpy.data.curves.new(f'rope-{i}', 'CURVE')
        curve.dimensions = '3D'
        curve.bevel_depth = ROPE['radius']
        spline = curve.splines.new('POLY')
        points = catenary(a, b, slack, 24)
        spline.points.add(len(points) - 1)
        for k, p in enumerate(points):
            spline.points[k].co = (*blender_point(p), 1.0)
        curve.materials.append(rope_mat)
        obj = bpy.data.objects.new(f'rope-{i}', curve)
        preview.objects.link(obj)
        for p in catenary(a, b, slack, lanterns + 1)[1:-1]:
            copy = bpy.data.objects.new(f'rope-lantern-{i}', lantern)
            copy.location = blender_point(p)
            preview.objects.link(copy)
    stage_proxy(preview)
    eye, target = Vector(CAMERA['position']), Vector(CAMERA['target'])
    cam = bpy.data.objects.new('camera', bpy.data.cameras.new('camera'))
    cam.data.sensor_fit = 'VERTICAL'
    cam.data.angle = math.radians(CAMERA['fov'])
    cam.data.clip_end = 200.0
    cam.location = blender_point(eye)
    cam.rotation_euler = (
        (blender_point(target) - blender_point(eye)).to_track_quat('-Z', 'Y').to_euler()
    )
    preview.objects.link(cam)
    bpy.context.scene.camera = cam
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 7.0
    sun.data.color = (1.0, 0.62, 0.32)
    sun.data.angle = math.radians(2.0)
    # The sun stands at the back right, 22 degrees high, and shines to the front left.
    toward = -blender_point(Vector((0.55, math.tan(math.radians(22)), -0.85)).normalized())
    sun.rotation_euler = toward.to_track_quat('-Z', 'Y').to_euler()
    preview.objects.link(sun)
    world = bpy.context.scene.world or bpy.data.worlds.new('world')
    bpy.context.scene.world = world
    background = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    background.inputs['Color'].default_value = (0.62, 0.43, 0.24, 1.0)
    background.inputs['Strength'].default_value = 1.8
    render = bpy.context.scene.render
    render.resolution_x, render.resolution_y = 1600, 1000
    return preview


def use_cycles(samples):
    """Selects Cycles with few samples and the denoiser, or keeps EEVEE when Cycles is absent."""
    scene = bpy.context.scene
    scene.view_settings.view_transform = 'AgX'
    scene.render.image_settings.file_format = 'PNG'
    try:
        scene.render.engine = 'CYCLES'
        scene.cycles.samples = samples
        scene.cycles.use_denoising = True
    except (TypeError, AttributeError):
        scene.render.engine = 'BLENDER_EEVEE'
        return
    # The GPU renders the views in a few seconds. Cycles keeps the CPU when no GPU answers.
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for device in prefs.devices:
            device.use = True
        scene.cycles.device = 'GPU'
    except (KeyError, TypeError, AttributeError):
        scene.cycles.device = 'CPU'


def view_camera(name, azimuth, elevation, distance, target, fov=40.0, ortho=0.0):
    """Adds a camera on a sphere around a target, at an azimuth from +z to +x, in degrees."""
    cam = bpy.data.objects.new(name, bpy.data.cameras.new(name))
    cam.data.clip_end = 300.0
    if ortho:
        cam.data.type = 'ORTHO'
        cam.data.ortho_scale = ortho
    else:
        cam.data.sensor_fit = 'VERTICAL'
        cam.data.angle = math.radians(fov)
    a, e = math.radians(azimuth), math.radians(elevation)
    eye = (
        Vector(target)
        + Vector((math.sin(a) * math.cos(e), math.sin(e), math.cos(a) * math.cos(e))) * distance
    )
    cam.location = blender_point(eye)
    cam.rotation_euler = (
        (blender_point(target) - blender_point(eye)).to_track_quat('-Z', 'Y').to_euler()
    )
    bpy.context.scene.collection.objects.link(cam)
    return cam


def render_to(path, camera):
    """Renders the scene through a camera into a PNG file."""
    bpy.context.scene.camera = camera
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def render_views(folder):
    """Renders the reference view of the app and the views from the front, the back, the left, the
    right, and the top into a folder."""
    use_cycles(64)
    render = bpy.context.scene.render
    render.resolution_x, render.resolution_y = 1600, 1000
    render_to(f'{folder}/reference-view.png', bpy.data.objects['camera'])
    render.resolution_x, render.resolution_y = 1200, 800
    for name, azimuth in (('front', 0), ('back', 180), ('left', -90), ('right', 90)):
        render_to(f'{folder}/view-{name}.png', view_camera(name, azimuth, 24, 44, (0.0, 2.0, 0.0)))
    render.resolution_x, render.resolution_y = 1000, 1000
    render_to(f'{folder}/view-top.png', view_camera('top', 0, 90, 60, (0.0, 0.0, 0.0), ortho=56.0))


def render_sheet(folder, objects):
    """Renders one sheet of all parts, each scaled into a cell, with its name, its triangle count,
    and its size."""
    for coll in bpy.data.collections:
        coll.hide_render = coll.name != 'forest-sheet'
    sheet = bpy.data.collections.new('forest-sheet')
    bpy.context.scene.collection.children.link(sheet)
    names = list(objects)
    columns, cell = 7, 3.0
    for i, name in enumerate(names):
        obj = objects[name]
        size = max(obj.dimensions)
        scale = cell * 0.62 / size if size > 0 else 1.0
        col, row = i % columns, i // columns
        x, z = (col - (columns - 1) / 2) * cell, (row - 1.5) * cell
        copy = bpy.data.objects.new(f'sheet-{name}', obj.data)
        # The middle of the box of the part goes to the middle of its cell, and its lowest point
        # to the ground of the sheet.
        points = [app_point(v.co) for v in obj.data.vertices]
        mid_x = (min(p.x for p in points) + max(p.x for p in points)) / 2
        mid_z = (min(p.z for p in points) + max(p.z for p in points)) / 2
        low = min(p.y for p in points)
        copy.location = blender_point((x - mid_x * scale, -low * scale, z - mid_z * scale))
        copy.scale = (scale, scale, scale)
        sheet.objects.link(copy)
        dims = [obj.dimensions[0], obj.dimensions[2], obj.dimensions[1]]
        text = bpy.data.curves.new(f'label-{name}', 'FONT')
        text.body = (
            f'{name}\n{len(obj.data.polygons)} tris\n' + ' x '.join(f'{d:.2f}' for d in dims) + ' m'
        )
        text.size = 0.24
        text.align_x = 'CENTER'
        label = bpy.data.objects.new(f'label-{name}', text)
        label.location = blender_point((x, 0.0, z + cell * 0.36))
        label.data.materials.append(preview_material('label', (0.9, 0.9, 0.85), 1.0))
        sheet.objects.link(label)
    sun = bpy.data.objects.new('sheet-sun', bpy.data.lights.new('sheet-sun', 'SUN'))
    sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(40), 0.0, math.radians(-30))
    sheet.objects.link(sun)
    world = bpy.context.scene.world
    background = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    background.inputs['Color'].default_value = (0.05, 0.05, 0.05, 1.0)
    background.inputs['Strength'].default_value = 1.0
    use_cycles(32)
    render = bpy.context.scene.render
    render.resolution_x, render.resolution_y = 2100, 1500
    rows = (len(names) + columns - 1) // columns
    cam = view_camera(
        'sheet',
        0,
        62,
        60,
        (0.0, 0.0, (rows - 1) / 2 * cell - 1.5 * cell + 0.2),
        ortho=columns * cell + 0.6,
    )
    render_to(f'{folder}/parts-sheet.png', cam)


def export(path, objects, empties):
    """Writes the parts and the empties into a GLB file."""
    bpy.ops.object.select_all(action='DESELECT')
    for obj in list(objects.values()) + list(empties):
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_extras=True,
        export_yup=True,
        export_apply=False,
        export_normals=False,
        export_texcoords=False,
        export_vertex_color='NAME',
        export_vertex_color_name='Col',
        export_materials='EXPORT',
        export_cameras=False,
        export_lights=False,
    )


def build(collection):
    """Builds the parts and their places, and gives the parts by name and the empties."""
    objects = build_parts(collection)
    footprints = {name: footprint(obj) for name, obj in objects.items()}
    places = scatter(random.Random(f'{SEED}-scatter'), objects, footprints)
    bpy.context.view_layer.update()
    empties = place_empties(collection, places, objects)
    bpy.context.view_layer.update()
    empties = [o for o in collection.objects if o.type == 'EMPTY']
    placed = sum(len(objects[p[0]].data.polygons) for p in places)
    placed += sum(rope[5] for rope in ROPES) * len(objects['lantern-hanging'].data.polygons)
    if placed > TRIANGLE_BUDGET:
        raise ValueError(f'The kit places {placed} triangles, above {TRIANGLE_BUDGET}.')
    return objects, empties, places, footprints


def main():
    argv = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else []
    out = argv[0]
    render_dir = argv[argv.index('--render') + 1] if '--render' in argv else None
    clear_scene()
    kit = bpy.data.collections.new('forest-kit')
    bpy.context.scene.collection.children.link(kit)
    objects, empties, _, _ = build(kit)
    export(out, objects, empties)
    if render_dir:
        build_preview(objects, empties)
        render_views(render_dir)
        render_sheet(render_dir, objects)


if __name__ == '__main__':
    main()
