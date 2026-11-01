"""Rebuilds the arms of any animal from the joints of its rig config, with no settings of a species.

The script does the steps of "The rebuild of the arms in Blender" of `docs/agents/rigging.md`
with the functions of the species scripts. It finds each setting of a species script from the
joints of `tools/mesh-rigs/<animal>.json` and from rays through the source mesh
(`step_measure()`):

1. Import the source mesh and Merge by Distance (`violin_arms.import_mesh()`).
2. Measure the arms: the shoulder line is the first section of the upper arm, from the shoulder
   joint, where each ray from the bone hits the arm near the median radius. The ring gaps and
   the ring count come from the radii and the lengths of the arm.
3. Cut each arm at the shoulder line and at the wrist, and model a quad tube of rings of 16
   vertices, each ring at a right angle to its bone (`wind_arms.step_cut_and_tube()`). Collapse
   the thin faces at the cut loops (`wind_arms.step_clean_cut()`).
4. Shrinkwrap the tube onto a hidden copy of the old arm, bridge it to the trunk and the paw,
   beautify the bridge, and collapse the thin bridge faces (`violin_arms.step_wrap()`,
   `step_bridge()`, `step_beautify()`, `wind_arms.step_clean_bridge()`).
5. Bake the fur color onto a UV strip of the atlas, transfer the custom normals, make the arms
   `--factor` times longer, and write `<animal>-arms.glb` (`violin_arms.step_uv()` to
   `step_export()`).
6. Add the studio skeleton with the segments and the helpers, parent with Automatic Weights,
   and run Limit Total 4 and Normalize All (`wind_arms.step_skeleton()`,
   `violin_arms.step_bind()`).
7. Fix the weights with the rules of `step_paint()`, and keep the share `weights.fingers` of the
   config on the fingers (`fox_arms.step_fingers()`).
8. Write `<animal>-weights.json` in the units of the rig config (`wind_arms.step_weights()`).

Run it in a terminal from the root of the tree:

    Blender -b --factory-startup -P tools/blender/arm_rebuild.py -- <animal> [--source <glb>]
        [--factor <f> | <upper>,<fore>] [--out <dir>] [--views <dir>]

`--source` is the mesh before the rebuild: `armSource` of the config by default, else `source`.
`--factor` makes the arms longer, 1 by default. The joints of the config are the joints of the
longer arms, as in the species scripts. `--out` is the folder of the output files, the folder of
`output` of the config by default. `--views` writes the check images of `cat_arms.look()`.

Two runs give the same bytes: the script runs Blender again with `PYTHONHASHSEED=0`, as
`mannequin.py` does. In the live Blender of MCP, `run_steps()` runs one step at a time.
"""

import json
import math
import os
import subprocess
import sys

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wind_arms as wa  # noqa: E402

va = wa.va

# `cat_arms.py` replaces `arm_faces()` and `arm_verts()` of `violin_arms.py` with the versions of
# the side wall when it loads. This script has no side wall, so it puts the plain versions back.
PLAIN = (va.arm_faces, va.arm_verts)
import cat_arms as ca  # noqa: E402
import fox_arms as fa  # noqa: E402

va.arm_faces, va.arm_verts = PLAIN

#: The distance of two rings of a tube, as a share of the local radius of the arm. The rings of
#: the rabbit and of the wolf stand 0.44 to 0.47 radii apart.
RING_SPACING = 0.45

#: The gap of the rings of a joint from the joint, as a share of the radius of the arm at the
#: joint: the gaps of the elbow and of the wrist of the wolf.
GAP_SHARE = 0.5

#: A section of the arm is free of the trunk when each ray from the bone hits the surface within
#: this factor of the median hit. Where the arm meets the trunk, a ray goes through the trunk.
FREE_RATIO = 1.5

#: The step of the shares of the upper arm in the search of the shoulder line, and the margin
#: after the first free share.
CUT_STEP = 0.05

#: The share of the upper arm from the first free section to the shoulder line.
CUT_MARGIN = 0.05

#: The largest share of the upper arm for the shoulder line.
CUT_MOST = 0.8

#: The shares of the paw from the wrist joint that the wrist cut tries, in order.
WRIST_CUTS = (0.1, 0.2, 0.3)

#: The faces of an arm zone are out from |x| of this share of the shoulder joint (the zones of
#: the rabbit, the wolf, the mouse, the elephant, and the bear: 0.63 to 0.75).
ZONE_X = 0.7

#: The radius of an arm zone around the arm line, as a factor of the largest ray hit of the free
#: arm (the zones of the rabbit, the wolf, and the mouse: 1.7 to 1.8).
ZONE_RADIUS = 1.75

#: The rays of a section, around the bone.
RAYS = 16

#: The longest ray, in units of the studio.
RAY_REACH = 0.3

#: The band of the shoulder line that `step_paint()` smooths, as a factor of the radius of the
#: shoulder cut loop around its center.
ROOT_BAND = 1.5

#: The share of the upper arm from the shoulder joint beyond which an arm vertex follows only the
#: bones of its own arm (`step_paint()`).
FREE_ARM = 0.5


class Session(va.Session):
    """The state of one rebuild, with the settings of `step_measure()` in place of the settings of
    a species script."""

    def __init__(self, animal, source=None, factor=1.0, out_dir=None):
        self.animal = animal
        path = os.path.join('tools', 'mesh-rigs', animal + '.json')
        with open(os.path.join(va.ROOT, path)) as f:
            self.config = json.load(f)
        folder = os.path.dirname(self.config['output'])
        self.spec = {
            'config': path,
            'source': source or self.config.get('armSource', self.config['source']),
            'folder': folder,
            'factor': factor,
            'slim': (1.0, 1.0),
            'texture': 512,
            'fingers': self.config.get('weights', {}).get('fingers', 1),
        }
        self.out_dir = out_dir or os.path.join(va.ROOT, folder)
        joints = self.config['joints']
        rule = self.config.get('proportions')
        if rule:
            joints = wa.source_units(joints, rule)
        self.joints = va.source_joints(joints, factor)
        self.mesh = None
        self.source = None
        self.rig = None
        self.fr = None
        self.loops = {}


def ray_hits(s, bvh, point, axis):
    """Casts `RAYS` rays from a point of a bone, at a right angle to its axis, and gives the
    distance of each hit in units of the studio, or None for a ray with no hit."""
    axis = axis.normalized()
    up = Vector((0, 0, 1))
    ref = (up - axis * axis.dot(up)).normalized()
    across = axis.cross(ref)
    out = []
    for k in range(RAYS):
        a = 2 * math.pi * k / RAYS
        hit = bvh.ray_cast(point, ref * math.cos(a) + across * math.sin(a), s.units(RAY_REACH))
        out.append(None if hit[0] is None else hit[3] / s.fr.height)
    return out


def median(values):
    """Gives the median of a list of numbers."""
    values = sorted(values)
    n = len(values)
    return values[n // 2] if n % 2 else (values[n // 2 - 1] + values[n // 2]) / 2


def free(hits):
    """Tells whether each ray of a section hits the arm within `FREE_RATIO` of the median hit."""
    if any(h is None for h in hits):
        return False
    return max(hits) <= FREE_RATIO * median(hits)


def arm_sections(s, bvh, side):
    """Gives the ray hits of the sections of one arm: the upper arm at each `CUT_STEP` share, the
    elbow, the forearm at each tenth, the wrist, and the paw at each share of `WRIST_CUTS`."""
    a, e, w, t = va.arm_line(s, side)
    u, f, h = (e - a).normalized(), (w - e).normalized(), (t - w).normalized()
    steps = int(round(1 / CUT_STEP))
    return {
        'upper': [(k / steps, ray_hits(s, bvh, a.lerp(e, k / steps), u)) for k in range(1, steps)],
        'elbow': ray_hits(s, bvh, e, u + f),
        'fore': [ray_hits(s, bvh, e.lerp(w, k / 10), f) for k in range(1, 10)],
        'wrist': ray_hits(s, bvh, w, f + h),
        'paw': [ray_hits(s, bvh, w.lerp(t, k), h) for k in WRIST_CUTS],
    }


def first_free(upper):
    """Gives the first share of the upper arm from which each section up to the elbow is free."""
    out = None
    for share, hits in reversed(upper):
        if not free(hits):
            break
        out = share
    if out is None:
        raise RuntimeError('No section of the upper arm is free of the trunk.')
    return out


def closed_loop(s, bm, side, point, normal):
    """Gives the crossing points of the closed loop of a plane around one arm of the source, or
    None when the plane finds no closed loop (`violin_arms.ring_faces()`)."""
    try:
        return va.ring_faces(s, bm, va.arm_line(s, side), side, point, normal)[1]
    except RuntimeError:
        return None


def zone_faces(s, bm, side):
    """Counts the faces of the arm zone of one side: each corner out from |x| `zone.x` and within
    `zone.radius` of the arm line."""
    line = va.arm_line(s, side)
    near_x = s.units(s.spec['zone']['x'])
    radius = s.units(s.spec['zone']['radius'])
    return sum(
        1
        for f in bm.faces
        if all(p.co.x * side > near_x and va.arm_distance(line, p.co) < radius for p in f.verts)
    )


def step_measure(s):
    """Finds the settings of the rebuild from the joints and from rays through the source mesh,
    and puts them into `s.spec` with the keys of `ANIMALS` of `violin_arms.py` and `wind_arms.py`:

    - `cut.shoulder`: the first free share of the upper arm (`first_free()`) plus `CUT_MARGIN`,
      the larger of the two sides, as long as the plane finds a closed loop around the arm.
      `cut.wrist`: the first share of `WRIST_CUTS` with a closed loop around the paw.
    - `gap` and `wristGap`: `GAP_SHARE` of the median radius at the elbow and at the wrist.
    - `upper` and `fore`: the rings `RING_SPACING` radii apart, from the shoulder line to the
      elbow ring, and from the elbow ring to the wrist ring.
    - `zone`: |x| `ZONE_X` of the shoulder joint, and `ZONE_RADIUS` of the largest hit of the
      free arm. `faces`: the faces of the zone, the most faces that a cut arm can have.

    Gives the settings as a dict for the log.
    """
    bm = bmesh.new()
    bm.from_mesh(s.mesh.data)
    bvh = BVHTree.FromBMesh(bm)
    sections = {side: arm_sections(s, bvh, side) for side in (1, -1)}
    start = max(first_free(sections[side]['upper']) for side in (1, -1))
    free_hits = [
        h
        for side in (1, -1)
        for share, hits in sections[side]['upper']
        if share >= start
        for h in hits
    ]
    free_hits += [
        h
        for side in (1, -1)
        for hits in sections[side]['fore'] + [sections[side]['elbow'], sections[side]['wrist']]
        for h in hits
        if h is not None
    ]

    def hit_median(hits):
        return median([h for h in hits if h is not None])

    def radius(key):
        return median([hit_median(sections[side][key]) for side in (1, -1)])

    upper_r = median(
        [
            median(hits)
            for side in (1, -1)
            for share, hits in sections[side]['upper']
            if share >= start
        ]
    )
    fore_r = median([hit_median(hits) for side in (1, -1) for hits in sections[side]['fore']])
    spec = s.spec
    spec['zone'] = {
        'x': round(ZONE_X * abs(s.joints['upper_arm_L']['head'][0]), 4),
        'radius': round(ZONE_RADIUS * max(free_hits), 4),
    }
    spec['gap'] = round(GAP_SHARE * radius('elbow'), 4)
    spec['wristGap'] = round(GAP_SHARE * radius('wrist'), 4)

    def closed(part, share):
        # A plane at the share of the upper arm (0) or of the paw (2) finds a loop on each side.
        for side in (1, -1):
            line = va.arm_line(s, side)
            a, b = line[part], line[part + 1]
            if closed_loop(s, bm, side, a.lerp(b, share), (b - a).normalized()) is None:
                return False
        return True

    shoulder = round(min(start + CUT_MARGIN, CUT_MOST), 4)
    while not closed(0, shoulder):
        shoulder = round(shoulder + CUT_STEP, 4)
        if shoulder > CUT_MOST:
            raise RuntimeError('No closed loop around the upper arm up to the share %s.' % CUT_MOST)
    wrist = next((share for share in WRIST_CUTS if closed(2, share)), None)
    if wrist is None:
        raise RuntimeError('No closed loop around the paw at the shares %s.' % (WRIST_CUTS,))
    spec['cut'] = {'shoulder': shoulder, 'tilt': 0.0, 'wrist': wrist}

    a, e, w, _ = va.arm_line(s, 1)
    upper_len = (e - a).length / s.fr.height
    fore_len = (w - e).length / s.fr.height

    end = 1 - spec['gap'] / upper_len
    count = max(2, round((end - shoulder) * upper_len / (RING_SPACING * upper_r)))
    spec['upper'] = tuple(
        round(shoulder + (end - shoulder) * k / count, 4) for k in range(1, count)
    )
    span = fore_len - spec['gap'] - spec['wristGap']
    spec['fore'] = max(3, round(span / (RING_SPACING * fore_r)) - 1)
    spec['faces'] = max(zone_faces(s, bm, side) for side in (1, -1))
    bm.free()
    return {k: spec[k] for k in ('cut', 'zone', 'gap', 'wristGap', 'upper', 'fore', 'faces')}


def cut_loop(s, side):
    """Gives the center and the mean radius of the shoulder cut loop of one side of the mesh, in
    Blender, and its lowest height in units of the studio (the armpit)."""
    off = 0 if side > 0 else 10
    code = va.PART['shoulder'] + off
    attr = s.mesh.data.attributes['arm_part'].data
    pts = [p.co.copy() for p in s.mesh.data.vertices if attr[p.index].value == code]
    center = sum(pts, Vector()) / len(pts)
    radius = sum((p - center).length for p in pts) / len(pts)
    armpit = (min(p.z for p in pts) - s.fr.floor) / s.fr.height
    return center, radius, armpit


def step_loops(s):
    """Keeps the shoulder cut loop of each side for `step_paint()`, after the clean of the cut
    loops. Gives the armpit height of each side in units of the studio."""
    s.loops = {side: cut_loop(s, side) for side in (1, -1)}
    return {side: round(s.loops[side][2], 4) for side in (1, -1)}


def step_clean_loops(s):
    """Collapses the thin faces whose corners all lie on one cut loop (Collapse Edges), after
    `wind_arms.step_clean_bridge()`. Beautify Faces can turn a bridge edge so that a triangle has
    three corners on the loop. On the mannequin, such a face with a corner of 7 degrees at the left
    shoulder line folded in each sample. While such a face has a corner below
    `wind_arms.CUT_ANGLE`, its shortest edge collapses to its middle. Gives the number of collapsed
    edges."""
    mesh = s.mesh
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(mesh.data)
    part = bm.verts.layers.int['arm_part']
    loops = {va.PART[c] + off for c in ('shoulder', 'wrist') for off in (0, 10)}
    count = 0
    for _ in range(200):
        thin = next(
            (
                f
                for f in bm.faces
                if len({p[part] for p in f.verts}) == 1
                and f.verts[0][part] in loops
                and min(math.degrees(c.calc_angle()) for c in f.loops) < wa.CUT_ANGLE
            ),
            None,
        )
        if thin is None:
            break
        edge = min(thin.edges, key=lambda e: e.calc_length())
        bmesh.ops.collapse(bm, edges=[edge], uvs=True)
        count += 1
    bmesh.update_edit_mesh(mesh.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    return count


def arm_island(s):
    """Gives the indices of the vertices of each arm: the tube, the wrist loop, and the paw
    (`violin_arms.arm_verts()`), by side."""
    bm = bmesh.new()
    bm.from_mesh(s.mesh.data)
    part = bm.verts.layers.int['arm_part']
    out = {
        side: {p.index for p in va.arm_verts(s, bm, part, off)} for side, off in ((1, 0), (-1, 10))
    }
    bm.free()
    return out


def side_bones(side):
    """Lists the vertex groups of the bones of one arm below the clavicle: the segments, the
    helpers, the paw, and the fingers."""
    name = 'L' if side > 0 else 'R'
    return va.arm_groups(name) + [f'hand_{name}', f'fingers_{name}']


def step_paint(s):
    """Fixes the weights with the Weight Paint tools, with rules from the joints and the cut
    loops (step 7 of `docs/agents/rigging.md`), in this order:

    1. The trunk below the armpits: Remove From Group of the bones of both arms on each vertex
       outside the arm islands and below the armpit of its side. A vertex with no weight left
       takes the chest (Assign).
    2. The free arm: Remove From Group of each bone outside its own arm on the island vertices
       beyond `FREE_ARM` of the upper arm, so that the paw and the forearm do not follow the
       trunk or the legs.
    3. The shoulder line: Smooth, 6 times, within `ROOT_BAND` loop radii of the center of each
       shoulder cut loop, as `violin_arms.step_paint()` does on its box of the arm root.
    4. The arms: Smooth, 4 times, on the vertices that hang at least 0.6 on the arm bones, as
       `violin_arms.step_paint()` does.

    Each fix ends with Limit Total 4 and Normalize All. Gives the counts of the vertices of each
    fix.
    """
    mesh, fr = s.mesh, s.fr
    islands = arm_island(s)
    both = islands[1] | islands[-1]
    arms = side_bones(1) + side_bones(-1)

    def height(p):
        return (p.co.z - fr.floor) / fr.height

    def trunk(p):
        side = 1 if p.co.x >= 0 else -1
        return p.index not in both and height(p) < s.loops[side][2]

    va.paint_mode(mesh, trunk)
    va.remove_from(mesh, arms)
    bpy.ops.object.mode_set(mode='OBJECT')
    deform = {
        g.index
        for g in mesh.vertex_groups
        if s.rig.data.bones.get(g.name) and s.rig.data.bones[g.name].use_deform
    }
    empty = [
        p.index
        for p in mesh.data.vertices
        if trunk(p) and not any(g.group in deform and g.weight > 0 for g in p.groups)
    ]
    if empty:
        mesh.vertex_groups['chest'].add(empty, 1.0, 'REPLACE')
    va.paint_mode(mesh, trunk)
    va.limit_and_normalize()
    bpy.ops.object.mode_set(mode='OBJECT')
    counts = {'trunk': sum(1 for p in mesh.data.vertices if trunk(p)), 'empty': len(empty)}

    others = {}
    for side in (1, -1):
        a, e, _, _ = va.arm_line(s, side)
        u, length = (e - a).normalized(), (e - a).length
        own = set(side_bones(side))
        keep = [g.name for g in mesh.vertex_groups if g.name not in own]
        index = islands[side]
        verts = {
            p.index
            for p in mesh.data.vertices
            if p.index in index and (p.co - a).dot(u) > FREE_ARM * length
        }
        va.paint_mode(mesh, lambda p: p.index in verts)
        va.remove_from(mesh, keep)
        va.limit_and_normalize()
        bpy.ops.object.mode_set(mode='OBJECT')
        others[side] = len(verts)
    counts['free'] = others

    def root(p):
        return any((p.co - c).length < ROOT_BAND * r for c, r, _ in s.loops.values())

    va.paint_mode(mesh, root)
    bpy.ops.object.vertex_group_smooth(group_select_mode='BONE_DEFORM', factor=0.5, repeat=6)
    va.limit_and_normalize()
    bpy.ops.object.mode_set(mode='OBJECT')
    counts['root'] = sum(1 for p in mesh.data.vertices if root(p))

    names = {g.index: g.name for g in mesh.vertex_groups}
    arm_set = set(arms)
    held = {
        p.index
        for p in mesh.data.vertices
        if sum(g.weight for g in p.groups if names[g.group] in arm_set) > 0.6
    }
    va.paint_mode(mesh, lambda p: p.index in held)
    bpy.ops.object.vertex_group_smooth(group_select_mode='BONE_DEFORM', factor=0.5, repeat=4)
    va.limit_and_normalize()
    bpy.ops.object.mode_set(mode='OBJECT')
    mesh.data.use_paint_mask_vertex = False
    counts['arms'] = len(held)
    return counts


def step_skeleton(s):
    """Adds the studio skeleton with the segments and the helpers (`wind_arms.step_skeleton()`).
    In Blender, the elbow helper spans twice `gap` and the wrist helper twice `wristGap`, so that
    the bone heat gives each helper the rings of its joint. A config with no `armSegments` takes
    the elbow helper. Gives the helper length of the config and of the bind, in units."""
    config = s.config.get('armSegments')
    helper = round(2 * s.spec['gap'], 4)
    s.config['armSegments'] = dict(config or {}, helper=helper)
    try:
        wa.step_skeleton(s)
    finally:
        if config is None:
            del s.config['armSegments']
        else:
            s.config['armSegments'] = config
    return {'config': config and config.get('helper'), 'bind': helper}


def step_weights(s):
    """Writes `<animal>-weights.json` in the units of the rig config (`wind_arms.step_weights()`),
    with a note that names this script."""
    count = wa.step_weights(s)
    path = os.path.join(s.out_dir, s.animal + '-weights.json')
    with open(path) as f:
        data = json.load(f)
    data['note'] = (
        'Weights of the %s with the rebuilt arms of tools/blender/arm_rebuild.py: automatic '
        'weights and the weight rules of step_paint(). Points in the units of the rig config.'
        % s.animal
    )
    with open(path, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    return count


def step_widen(s):
    """Scales the atlas of the source up by a whole factor, with no blend of the pixels, when it is
    narrower than the arm image, so that `violin_arms.step_atlas()` has room for the strip. The UVs
    stay, because they are shares of the image. A palette atlas, such as the 32 pixels of the
    mannequin, keeps its cells. Gives the factor."""
    import numpy as np

    mat = s.mesh.data.materials[0]
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    node = bsdf.inputs['Base Color'].links[0].from_node
    atlas = node.image
    width, height = atlas.size
    factor = math.ceil(s.spec['texture'] / width)
    if factor <= 1:
        return 1
    pixels = np.empty(width * height * 4, np.float32)
    atlas.pixels.foreach_get(pixels)
    pixels = pixels.reshape(height, width, 4).repeat(factor, axis=0).repeat(factor, axis=1)
    image = bpy.data.images.new(atlas.name + '-wide', width * factor, height * factor)
    image.colorspace_settings.name = atlas.colorspace_settings.name
    image.pixels.foreach_set(pixels.ravel())
    image.pack()
    node.image = image
    node.interpolation = 'Closest'
    return factor


def step_look(s):
    """Renders the check images of the left arm (`cat_arms.look()`) when `--views` names a
    folder, with the elbow in the middle of each image."""
    if ca.VIEWS is None:
        return None
    _, e, _, _ = va.arm_line(s, 1)
    center = ((e.x) / s.fr.height, (e.z - s.fr.floor) / s.fr.height, -e.y / s.fr.height)
    ca.look(s, 'arms', center=center, scale=0.4)
    return ca.VIEWS


#: The steps of the rebuild, in order.
STEPS = (
    va.import_mesh,
    step_measure,
    wa.step_cut_and_tube,
    wa.step_clean_cut,
    step_loops,
    va.step_wrap,
    va.step_bridge,
    va.step_beautify,
    wa.step_clean_bridge,
    step_clean_loops,
    va.step_uv,
    va.step_bake,
    va.step_normals,
    va.step_shape,
    step_widen,
    va.step_atlas,
    step_look,
    va.step_export,
    step_skeleton,
    va.step_bind,
    step_paint,
    fa.step_fingers,
    step_weights,
)


def run_steps(s, first=0, last=len(STEPS)):
    """Runs the steps from `first` up to `last` (not included), and prints the result of each."""
    for step in STEPS[first:last]:
        print('%s: %s' % (step.__name__, step(s)))


def parse(argv):
    """Reads the arguments after `--`: the animal and the options of the docstring."""
    usage = (
        'Usage: Blender -b --factory-startup -P tools/blender/arm_rebuild.py -- <animal> '
        '[--source <glb>] [--factor <f> | <upper>,<fore>] [--out <dir>] [--views <dir>]'
    )
    if not argv or argv[0].startswith('--'):
        raise SystemExit(usage)
    out = {'animal': argv[0], 'source': None, 'factor': 1.0, 'out': None, 'views': None}
    rest = argv[1:]
    while rest:
        if len(rest) < 2 or rest[0] not in ('--source', '--factor', '--out', '--views'):
            raise SystemExit(usage)
        key, value = rest[0][2:], rest[1]
        if key == 'factor':
            parts = [float(v) for v in value.split(',')]
            value = parts[0] if len(parts) == 1 else tuple(parts)
        elif key != 'source':
            value = os.path.abspath(value)
        out[key] = value
        rest = rest[2:]
    return out


def main():
    """Runs the steps, and writes `<animal>-arms.glb` and `<animal>-weights.json` into the out
    dir."""
    argv = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else []
    if sys.flags.hash_randomization:
        # A fixed string hash gives the same order of each set and dict on each run.
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
    args = parse(argv)
    if args['views']:
        ca.VIEWS = args['views']
        os.makedirs(ca.VIEWS, exist_ok=True)
    va.clear_scene()
    s = Session(args['animal'], args['source'], args['factor'], args['out'])
    os.makedirs(s.out_dir, exist_ok=True)
    run_steps(s)
    print(
        'arm_rebuild: wrote %s-arms.glb and %s-weights.json into %s'
        % (s.animal, s.animal, s.out_dir)
    )


if __name__ == '__main__':
    main()
