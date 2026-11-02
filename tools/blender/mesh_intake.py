"""Checks a source mesh against the intake spec of a clean quad mesh (design 4.4, "Source meshes").

    blender -b --factory-startup --python tools/blender/mesh_intake.py -- <mesh.glb> <config.json>
        [--factor <f> | <upper>,<fore>] [--budget <triangles>]

`pnpm mesh-intake` runs this script. The config `tools/mesh-rigs/<animal>.json` gives the joints,
and `--factor` the arm factor of the joints, as `arm_rebuild.py` takes it. The script prints one
line for each point of the spec with `PASS` or `FAIL` and the measure, then the verdict:
`keep faces` (`arm_rebuild.py --keep-faces` can rig the mesh with its faces) or `needs rebuild`,
with the reasons.

The steps:

1. Import the mesh and Merge by Distance (`violin_arms.import_mesh()`). A GLB file holds only
   triangles. The glTF exporter writes the two triangles of a quad one after the other, so two
   such triangles with a shared edge join into one quad again (`join_quads()`).
2. Find the shoulder line of each arm as `arm_rebuild.step_measure()` does: the first section of
   the upper arm that is free of the trunk, plus `CUT_MARGIN`. It must lie before `FREE_ARM`, where
   the free-arm rule of `arm_rebuild.step_paint()` starts. The arm is the part of the mesh beyond
   that line (`arm_rebuild.free_arm()`). The gap is the smallest distance from the free arm to the
   rest of the mesh.
3. Find the edge loops of the quads that go around each arm bone and each leg (`edge_rings()`):
   the rings. Each ring gives its place along the limb, its radius, its tilt from a right angle
   to the bone, and its vertices.
4. Sample the base color texture in each face of the arms, and count the faces whose samples
   differ by a color edge (`color_faces()`).
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import arm_rebuild as ar  # noqa: E402

va = ar.va

#: The A-pose of each upper arm, in degrees below the horizontal. A hanging arm and a raised arm
#: then bend the shoulder about the same angle from the bind, and the armpit stays open.
POSE = (30.0, 45.0)

#: The smallest gap from the free arm (beyond `ar.FREE_ARM` of the upper arm) to the trunk and the
#: legs, as a share of the radius of the upper arm. Bone heat then keeps the arm weights off the
#: trunk, and the free-arm rule of `arm_rebuild.step_paint()` holds.
GAP = 0.25

#: The largest distance of two rings along an arm, as a share of the mean radius of the two rings.
#: The rebuilt arms have 0.45 to 0.5 radii, and they pass the arm gate.
SPACING = 0.6

#: The largest tilt of a ring from a right angle to its bone, in degrees. Near a joint, the ring
#: can also stand at a right angle to the half-way axis of the two bones.
TILT = 15.0

#: The fewest vertices of a ring. The rebuilt arms have 16. A ring of fewer vertices shows a flat
#: side when the arm twists.
RING_VERTS = 12

#: The fewest rings within `JOINT_REACH` radii of each joint. Each joint has a helper bone that
#: spans its rings, so that the bend spreads over several faces.
JOINT_RINGS = {'elbow': 3, 'wrist': 2, 'knee': 3}

#: The span on each side of a joint in which a ring counts as a ring of the joint, as a share of
#: the radius of the limb at the joint.
JOINT_REACH = 1.0

#: The most faces of each arm across a color edge. Each face takes one color, so such a face gives
#: a saw-tooth edge.
COLOR_FACES = 0

#: The smallest share of the triangles in quads. A triangle stops an edge loop.
QUAD_SHARE = 0.9

#: The samples of a face for its color: the middle and each corner, pulled this share of the way
#: to the middle.
CORNER_PULL = 0.3

#: The longest edge loop, in edges.
LOOP_MOST = 200


class Intake(ar.Session):
    """The state of one check: the session of `arm_rebuild.py` with the mesh to check."""

    def __init__(self, animal, mesh_path, factor):
        super().__init__(animal, source=os.path.abspath(mesh_path), factor=factor)
        self.lines = []

    def line(self, ok, name, text):
        """Prints one line of the spec, and keeps it for the verdict."""
        self.lines.append((ok, name, text))
        print('mesh_intake: %s  %-16s %s' % ('PASS' if ok else 'FAIL', name, text))


def join_quads(bm):
    """Joins each two triangles that follow one another in the face order and share an edge into
    one quad (`bmesh.utils.face_join()`). Gives the number of quads."""
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


def limb_line(s, names, side):
    """Gives the joints of a limb in Blender, from the joint names of the left side."""
    return [s.fr.point(s.joints[n]['head'], side) for n in names]


def station(line, co):
    """Gives the distance along a polyline to the point of it nearest to `co`, the index of that
    segment, and the distance from `co` to the polyline."""
    best, at = None, 0.0
    for i in range(len(line) - 1):
        a, b = line[i], line[i + 1]
        ab = b - a
        t = max(0.0, min(1.0, (co - a).dot(ab) / ab.length_squared))
        d = (co - (a + ab * t)).length
        if best is None or d < best[2]:
            best = (at + t * ab.length, i, d)
        at += ab.length
    return best


def joint_stations(line):
    """Gives the distance along a polyline to each of its points."""
    out, at = [0.0], 0.0
    for a, b in zip(line, line[1:]):
        at += (b - a).length
        out.append(at)
    return out


def edge_loop(edge):
    """Walks the edge loop of an edge over the vertices of 4 quads. Gives the vertices of the loop
    in order, or None for a loop that does not close."""
    verts, e, p = [edge.verts[0]], edge, edge.verts[1]
    for _ in range(LOOP_MOST):
        if p is verts[0]:
            return verts
        verts.append(p)
        if len(p.link_edges) != 4 or any(len(f.verts) != 4 for f in p.link_faces):
            return None
        faces = set(e.link_faces)
        nxt = [g for g in p.link_edges if g is not e and not faces & set(g.link_faces)]
        if len(nxt) != 1:
            return None
        e = nxt[0]
        p = e.other_vert(p)
    return None


def ring_frame(pts):
    """Gives the middle, the mean radius, and the normal of the plane of best fit of a ring."""
    import numpy as np

    arr = np.array([p[:] for p in pts])
    mid = arr.mean(axis=0)
    _, _, vt = np.linalg.svd(arr - mid)
    normal = Vector(vt[2].tolist())
    center = Vector(mid.tolist())
    radius = float(np.linalg.norm(arr - mid, axis=1).mean())
    return center, radius, normal


def winds(pts, center, axis):
    """Tells whether a closed ring goes one time around an axis through its middle."""
    axis = axis.normalized()
    ref = (pts[0] - center) - axis * (pts[0] - center).dot(axis)
    if ref.length == 0:
        return False
    across = axis.cross(ref)
    total, last = 0.0, None
    for p in list(pts) + [pts[0]]:
        d = p - center
        a = math.atan2(d.dot(across), d.dot(ref))
        if last is not None:
            step = (a - last + math.pi) % (2 * math.pi) - math.pi
            total += step
        last = a
    return abs(abs(total) - 2 * math.pi) < 0.5


def edge_rings(bm, line, reach, keep):
    """Finds the rings of a limb: the closed edge loops of quads whose vertices all pass `keep`
    and lie within `reach` of the polyline `line`, and that go one time around it. Gives each ring
    as a dict: its distance along the line (`at`), its radius, its tilt from a right angle to its
    bone in degrees (or to the half-way axis of a joint within one radius of it), and its vertex
    count, in the order along the line."""
    joints = joint_stations(line)
    axes = [(b - a).normalized() for a, b in zip(line, line[1:])]
    seen, out = set(), []
    for edge in bm.edges:
        if edge in seen or not all(keep(p) and station(line, p.co)[2] < reach for p in edge.verts):
            continue
        verts = edge_loop(edge)
        if verts is None:
            continue
        loop_edges = {bm.edges.get((a, b)) for a, b in zip(verts, verts[1:] + verts[:1])}
        if loop_edges & seen:
            continue
        seen |= loop_edges
        if not all(keep(p) and station(line, p.co)[2] < reach for p in verts):
            continue
        pts = [p.co.copy() for p in verts]
        center, radius, normal = ring_frame(pts)
        at, index, _ = station(line, center)
        if not winds(pts, center, axes[index]):
            continue
        choices = [axes[index]]
        for k in range(1, len(line) - 1):
            if abs(at - joints[k]) < radius:
                choices.append((axes[k - 1] + axes[k]).normalized())
        tilt = min(math.degrees(math.acos(min(1.0, abs(normal.dot(c))))) for c in choices)
        out.append({'at': at, 'radius': radius, 'tilt': tilt, 'verts': len(verts)})
    return sorted(out, key=lambda r: r['at'])


def section_radius(s, bvh, point, axis):
    """Gives the median distance of the ray hits of a section in Blender, or None with no hit."""
    hits = [h for h in ar.ray_hits(s, bvh, point, axis) if h is not None]
    return s.units(ar.median(hits)) if hits else None


def base_image(mesh):
    """Gives the pixels of the base color image of the mesh as an array of sRGB rows, or None."""
    import numpy as np

    for mat in mesh.data.materials:
        if mat is None or mat.node_tree is None:
            continue
        bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        links = bsdf.inputs['Base Color'].links if bsdf else ()
        if links and getattr(links[0].from_node, 'image', None):
            image = links[0].from_node.image
            width, height = image.size
            pixels = np.empty(width * height * 4, np.float32)
            image.pixels.foreach_get(pixels)
            return pixels.reshape(height, width, 4)[:, :, :3]
    return None


def color_faces(bm, faces, pixels):
    """Counts the faces whose color samples differ by at least `ar.EDGE_COLOR`: the middle of the
    face and each corner pulled `CORNER_PULL` of the way to the middle, in the UV of the face."""
    import numpy as np

    uv = bm.loops.layers.uv.active
    height, width = pixels.shape[:2]
    count = 0
    for f in faces:
        corners = [Vector(lp[uv].uv) for lp in f.loops]
        mid = sum(corners, Vector((0, 0))) / len(corners)
        samples = [mid] + [c.lerp(mid, CORNER_PULL) for c in corners]
        colors = []
        for p in samples:
            x = min(width - 1, max(0, int(p.x % 1.0 * width)))
            y = min(height - 1, max(0, int(p.y % 1.0 * height)))
            colors.append(pixels[y, x])
        spread = max(float(np.linalg.norm(a - b)) for a in colors for b in colors)
        count += spread >= ar.EDGE_COLOR
    return count


def free_start(sections):
    """Gives the first free share of the upper arm (`arm_rebuild.first_free()`), or None for an
    arm with no free section."""
    try:
        return ar.first_free(sections['upper'])
    except RuntimeError:
        return None


def free_hits(sections, start):
    """Gives the ray hits of the free arm: the upper arm from `start` (or from its middle with no
    free section), the elbow, the forearm, and the wrist, in units of the studio."""
    begin = 0.5 if start is None else start
    out = [h for share, hits in sections['upper'] if share >= begin for h in hits]
    out += [h for hits in sections['fore'] + [sections['elbow'], sections['wrist']] for h in hits]
    return [h for h in out if h is not None]


def set_zone(s, sections):
    """Puts the arm zone of `arm_rebuild.step_measure()` into `s.spec`: |x| `ar.ZONE_X` of the
    shoulder joint, and `ar.ZONE_RADIUS` of the largest hit of the free arms."""
    hits = [h for side in (1, -1) for h in free_hits(sections[side], free_start(sections[side]))]
    s.spec['zone'] = {
        'x': ar.ZONE_X * abs(s.joints['upper_arm_L']['head'][0]),
        'radius': ar.ZONE_RADIUS * max(hits),
    }


def check_arm(s, bm, bvh, side, sections, pixels):
    """Checks one arm: the pose, the gap, the rings along the arm, the rings of the elbow and the
    wrist, and the color edges."""
    name = 'L' if side > 0 else 'R'
    a, e, w, t = va.arm_line(s, side)
    u = (e - a).normalized()
    drop = math.degrees(math.asin(max(-1.0, min(1.0, -u.z))))
    s.line(POSE[0] <= drop <= POSE[1], 'pose ' + name,
           '%.1f° below the horizontal (limit %g° to %g°)' % (drop, *POSE))
    start = free_start(sections)
    begin = 0.5 if start is None else start
    upper_r = s.units(ar.median([ar.median([h for h in hits if h is not None])
                                 for share, hits in sections['upper']
                                 if share >= begin and any(hits)]))
    if start is None:
        s.line(False, 'arm free ' + name, 'no section of the upper arm is free of the trunk')
        s.line(False, 'gap ' + name, 'no section of the upper arm is free of the trunk')
        island = None
    else:
        shoulder = min(start + ar.CUT_MARGIN, ar.CUT_MOST)
        s.line(shoulder < ar.FREE_ARM, 'arm free ' + name, 'the shoulder line at %.2f of the '
               'upper arm (limit below %.2f)' % (shoulder, ar.FREE_ARM))
        island = ar.free_arm(s, bm, side, shoulder)
        if island is None:
            s.line(False, 'gap ' + name, 'the arm joins the trunk or a leg beyond the shoulder '
                   'line (%.2f of the upper arm)' % shoulder)
        else:
            free = [p for p in island if (p.co - a).dot(u) > ar.FREE_ARM * (e - a).length]
            rest = [f for f in bm.faces if not any(p in island for p in f.verts)]
            tree = BVHTree.FromPolygons([p.co for p in bm.verts],
                                        [[p.index for p in f.verts] for f in rest])
            gap = min(tree.find_nearest(p.co)[3] for p in free) / upper_r
            s.line(gap >= GAP, 'gap ' + name, '%.2f upper arm radii from the free arm to the '
                   'trunk and the legs (limit at least %.2f)' % (gap, GAP))
    if island is None:

        def keep(p):
            return (p.co - a).dot(u) > 0
    else:
        def keep(p):
            return p in island
    reach = s.units(s.spec['zone']['radius'])
    rings = edge_rings(bm, [a, e, w, t], reach, keep)
    stations = joint_stations([a, e, w, t])
    arm = [r for r in rings if r['at'] <= stations[2] + 0.5 * r['radius']]
    shoulder_at = (start or 0.0) * stations[1]
    length = stations[2] - shoulder_at
    radii = [r['radius'] for r in arm] or [upper_r]
    need = math.ceil(length / (SPACING * ar.median(radii)))
    s.line(len(arm) >= need, 'ring count ' + name, '%d rings from the shoulder line to the wrist '
           '(limit at least %d)' % (len(arm), need))
    steps = [(r1['at'] - r0['at']) / ((r0['radius'] + r1['radius']) / 2)
             for r0, r1 in zip(arm, arm[1:])]
    if steps:
        s.line(max(steps) <= SPACING, 'ring spacing ' + name, 'most %.2f arm radii, median %.2f '
               '(limit at most %.2f)' % (max(steps), ar.median(steps), SPACING))
        tilt = max(r['tilt'] for r in arm)
        s.line(tilt <= TILT, 'ring tilt ' + name, 'most %.1f° (limit at most %g°)' % (tilt, TILT))
        counts = [r['verts'] for r in arm]
        s.line(min(counts) >= RING_VERTS, 'ring verts ' + name, '%d to %d vertices (limit at '
               'least %d)' % (min(counts), max(counts), RING_VERTS))
    else:
        for key in ('ring spacing ', 'ring tilt ', 'ring verts '):
            s.line(False, key + name, 'fewer than 2 rings')
    for joint, k, axis in (('elbow', 1, u + (w - e).normalized()),
                           ('wrist', 2, (w - e).normalized() + (t - w).normalized())):
        radius = section_radius(s, bvh, (e, w)[k - 1], axis) or upper_r
        count = sum(1 for r in rings if abs(r['at'] - stations[k]) <= JOINT_REACH * radius)
        s.line(count >= JOINT_RINGS[joint], '%s rings %s' % (joint, name), '%d rings within '
               '%g radius of the joint (limit at least %d)' % (count, JOINT_REACH,
                                                               JOINT_RINGS[joint]))
    faces = [f for f in bm.faces if all(keep(p) for p in f.verts)
             and va.arm_distance([a, e, w, t], f.calc_center_median()) < reach]
    if pixels is None:
        s.line(True, 'color edges ' + name, 'no base color image: one color')
    else:
        count = color_faces(bm, faces, pixels)
        s.line(count <= COLOR_FACES, 'color edges ' + name, '%d of %d arm faces cross a color '
               'edge (limit at most %d)' % (count, len(faces), COLOR_FACES))


def check_knee(s, bm, bvh, side):
    """Checks the rings across the knee of one leg."""
    name = 'L' if side > 0 else 'R'
    line = limb_line(s, ('thigh_L', 'shin_L', 'foot_L'), side)
    hip, knee, ankle = line
    axis = (knee - hip).normalized() + (ankle - knee).normalized()
    radius = section_radius(s, bvh, knee, axis)
    if radius is None:
        s.line(False, 'knee rings ' + name, 'no ray hits the leg at the knee')
        return
    rings = edge_rings(bm, line, 2 * radius, lambda p: p.co.x * side > 0)
    at = joint_stations(line)[1]
    count = sum(1 for r in rings if abs(r['at'] - at) <= JOINT_REACH * radius)
    s.line(count >= JOINT_RINGS['knee'], 'knee rings ' + name, '%d rings within %g radius of the '
           'joint (limit at least %d)' % (count, JOINT_REACH, JOINT_RINGS['knee']))


def step_check(s, budget):
    """Runs the checks on the imported mesh, and prints the verdict."""
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    if len(meshes) != 1:
        raise SystemExit('%s has %d meshes, not 1.' % (s.spec['source'], len(meshes)))
    bm = bmesh.new()
    bm.from_mesh(s.mesh.data)
    triangles = sum(len(f.verts) - 2 for f in bm.faces)
    quads = join_quads(bm)
    bm.verts.ensure_lookup_table()
    bm.verts.index_update()
    bvh = BVHTree.FromBMesh(bm)
    sections = {side: ar.arm_sections(s, bvh, side) for side in (1, -1)}
    set_zone(s, sections)
    pixels = base_image(s.mesh)
    for side in (1, -1):
        check_arm(s, bm, bvh, side, sections[side], pixels)
    for side in (1, -1):
        check_knee(s, bm, bvh, side)
    s.line(triangles <= budget, 'triangles', '%d (limit at most %d)' % (triangles, budget))
    share = 2 * quads / triangles if triangles else 0.0
    s.line(share >= QUAD_SHARE, 'quad share', '%.2f of the triangles in quads (limit at least '
           '%.2f)' % (share, QUAD_SHARE))
    bm.free()
    # The reasons: each failed point once, with the sides that fail it.
    fails = {}
    for ok, name, _ in s.lines:
        point, _, side = name.rpartition(' ') if name[-2:] in (' L', ' R') else (name, '', '')
        if not ok:
            fails.setdefault(point, []).append(side)
    if fails:
        reasons = ', '.join(' '.join([point] + sides).strip() for point, sides in fails.items())
        print('mesh_intake: verdict: needs rebuild (%s)' % reasons)
    else:
        print('mesh_intake: verdict: keep faces')


def parse(argv):
    """Reads the arguments after `--`: the mesh, the config, and the options of the docstring."""
    usage = ('Usage: Blender -b --factory-startup -P tools/blender/mesh_intake.py -- <mesh.glb> '
             '<config.json> [--factor <f> | <upper>,<fore>] [--budget <triangles>]')
    if len(argv) < 2 or argv[0].startswith('--') or argv[1].startswith('--'):
        raise SystemExit(usage)
    out = {'mesh': argv[0], 'config': argv[1], 'factor': 1.0, 'budget': 5600}
    rest = argv[2:]
    while rest:
        if len(rest) < 2 or rest[0] not in ('--factor', '--budget'):
            raise SystemExit(usage)
        key, value = rest[0][2:], rest[1]
        if key == 'factor':
            parts = [float(v) for v in value.split(',')]
            value = parts[0] if len(parts) == 1 else tuple(parts)
        else:
            value = int(value)
        out[key] = value
        rest = rest[2:]
    return out


def main():
    """Imports the mesh, and runs the checks."""
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    args = parse(argv)
    config = os.path.abspath(args['config'])
    folder = os.path.join(va.ROOT, 'tools', 'mesh-rigs')
    if os.path.dirname(config) != folder:
        raise SystemExit('The config must be a file of tools/mesh-rigs/: %s' % args['config'])
    animal = os.path.splitext(os.path.basename(config))[0]
    va.clear_scene()
    s = Intake(animal, args['mesh'], args['factor'])
    va.import_mesh(s)
    mesh = os.path.relpath(os.path.abspath(args['mesh']), va.ROOT)
    print('mesh_intake: %s with the joints of %s' % (mesh, os.path.relpath(config, va.ROOT)))
    step_check(s, args['budget'])


if __name__ == '__main__':
    main()
