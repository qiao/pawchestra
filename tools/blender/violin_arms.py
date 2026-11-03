"""Gives the steps that rebuild the arms of an animal with a quad tube, which `arm_rebuild.py`
and the species scripts reuse. Each species script puts its settings into `ANIMALS`.

The rebuild uses loop edges, retopology, and extra bones to fix the twist of the arms and the
wrists. The session makes these steps in the live Blender through MCP, with an image after each
step, and this script repeats them in the same order, as `polar_bear_arms.py` does for the polar
bear:

1. Import the mesh and Merge by Distance.
2. Replace the faces of each arm from the shoulder line to the wrist with a quad tube: Bisect at
   the shoulder line and at the wrist, Delete Faces, a tube of rings of `RING_VERTS`, Shrinkwrap
   onto the source arm, Bridge Edge Loops to the trunk and to the paw, and Beautify Faces on the
   bridge triangles. The faces of the paws, the trunk, the legs, and the head stay.
3. Give the new arm faces a UV layout, bake the fur color of the source arm onto them (Cycles,
   Selected to Active), and transfer the custom normals of the source surface (Data Transfer).
4. Give the arms the cross-section and the length of the app body (`step_shape()`), put the arm
   image in a strip on top of the atlas, so that the mesh keeps one material, and write the new
   source `<animal>-arms.glb`.
5. Add the studio skeleton with the arm segments and the elbow and wrist helpers (`armSegments`
   of the rig config), parent with automatic weights, and paint the fixes with the Weight Paint
   tools (`paint_weights()`).
6. Write the weights for `paintedWeights` of the config (`<animal>-weights.json`).

Then `pnpm rig-mesh <animal>` and `pnpm studio-body <animal>` make the app body. The app turns the
segments and the helpers from the joints of the pose (`poseArm()` of `src/models/studio-rig.ts`).

Run it in a terminal from the root of the tree:

    Blender -b --factory-startup -P tools/blender/violin_arms.py -- <animal> [<out dir>]

In the live Blender of MCP, `run_steps()` runs one step at a time.
"""

import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

#: The weld of Merge by Distance, in meters of the source, as `weld` of the configs.
WELD = 1e-5

#: The settings of each animal, in the units of the studio (1 unit from the soles to the top of
#: the source). `cut`: the shoulder line at the share `shoulder` of the upper arm from the
#: shoulder joint, with its plane turned `tilt` degrees toward the side of the trunk, and the
#: wrist at the share `wrist` of the paw from the wrist joint. `zone`: the faces of one arm are
#: out from |x| `x` and within `radius` of the arm line. `gap`: the distance of the rings of a
#: joint from the joint. `upper`: the shares of the upper arm with a ring. `fore`: the number of
#: inner rings of the forearm. `texture`: the size of the arm image in pixels. `faces`: the most
#: faces that one arm can have between its cuts. `paint`: the places of the Weight Paint fixes.
#: `bake` (optional): the cage extrusion and the most ray distance of the bake, 0.006 and 0.017
#: by default. `factor`: the length factor of the upper arm and the forearm, or a pair of factors
#: (upper arm, forearm), and `slim`: the factors of their cross-sections, which `step_shape()`
#: gives the mesh. The joints of the config are the joints of the shaped arm, and its `armFactor` is 1, because the rig with arm segments
#: does not stretch the arms (`armSegments` of `tools/blender/rig_mesh.py`).
ANIMALS = {}

#: The vertices of each ring of a tube.
RING_VERTS = 16

#: The codes of the vertex attribute `arm_part` (the left side; the right side adds 10).
PART = {'shoulder': 1, 'wrist': 2, 'tube': 3}

#: The UV seam of each tube runs along this spoke: the lower side of the arm in the bind pose.
SEAM_SPOKE = RING_VERTS // 2


class Frame:
    """Converts the units of the studio (1 unit from the soles to the top, y up, +z forward) to
    the meters of the source in Blender (z up, -y forward)."""

    def __init__(self, mesh):
        heights = [p.co.z for p in mesh.data.vertices]
        self.floor = min(heights)
        self.height = max(heights) - self.floor

    def point(self, p, side=1):
        """Gives a point of the studio in Blender. Side -1 mirrors it to the right side."""
        return Vector((p[0] * side * self.height, -p[2] * self.height,
                       p[1] * self.height + self.floor))


def arm_factors(factor):
    """Gives the length factors (upper arm, forearm) of `factor`: one number for both, or a
    pair."""
    if isinstance(factor, (tuple, list)):
        return float(factor[0]), float(factor[1])
    return factor, factor


def source_joints(joints, factor):
    """Gives the joints of the arms of the source mesh from the joints of the config, which are
    the joints of the arms that `step_shape()` makes `factor` times longer (`arm_factors()`): the
    elbow and the wrist move back toward the shoulder joint, and the paw joints move with the
    wrist."""
    upper, fore = arm_factors(factor)
    out = {name: dict(spec) for name, spec in joints.items()}
    s = Vector(joints['upper_arm_L']['head'])
    e2 = Vector(joints['forearm_L']['head'])
    e = s + (e2 - s) / upper
    w2 = Vector(joints['hand_L']['head'])
    w = e + (w2 - e2) / fore
    t2 = Vector(joints['forearm_twist_L']['head'])
    out['forearm_L']['head'] = list(e)
    out['forearm_twist_L']['head'] = list(e + (t2 - e2) / fore)
    out['hand_L']['head'] = list(w)
    out['fingers_L']['head'] = list(Vector(joints['fingers_L']['head']) - (w2 - w))
    out['fingers_L']['tail'] = list(Vector(joints['fingers_L']['tail']) - (w2 - w))
    return out


class Session:
    """The state of one rebuild: the animal, its settings, its config, and the objects."""

    def __init__(self, animal, out_dir=None):
        self.animal = animal
        self.spec = ANIMALS[animal]
        with open(os.path.join(ROOT, self.spec['config'])) as f:
            self.config = json.load(f)
        self.out_dir = out_dir or os.path.join(ROOT, self.spec['folder'])
        self.joints = source_joints(self.config['joints'], self.spec['factor'])
        self.mesh = None
        self.source = None
        self.rig = None
        self.fr = None

    def units(self, value):
        """Gives a length in units of the studio in meters of the source."""
        return value * self.fr.height


def import_mesh(s):
    """Imports the source mesh and merges the vertices at its UV seams (Merge by Distance).

    The glTF import splits the vertices at each UV seam. Merge by Distance joins them again, as a
    rigger does before a retopology or automatic weights. The UVs stay on the face corners.
    """
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, s.spec['source']))
    mesh = [o for o in bpy.context.selected_objects if o.type == 'MESH'][0]
    mesh.name = mesh.data.name = s.animal
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=WELD)
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    s.mesh = mesh
    s.fr = Frame(mesh)
    return mesh


def seg_distance(p, a, b):
    """Gives the distance from point p to the segment from a to b."""
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length


def arm_line(s, side):
    """Gives the shoulder, the elbow, the wrist, and the finger tip of one arm in Blender."""
    j = s.joints
    return [s.fr.point(j['upper_arm_L']['head'], side), s.fr.point(j['forearm_L']['head'], side),
            s.fr.point(j['hand_L']['head'], side), s.fr.point(j['fingers_L']['tail'], side)]


def arm_distance(line, co):
    """Gives the distance from a point to the arm line from the shoulder to the finger tip."""
    return min(seg_distance(co, line[i], line[i + 1]) for i in range(3))


def cut_planes(s, line, side):
    """Gives the cut plane (point, normal) at the shoulder line and at the wrist. The plane of the
    shoulder line turns `tilt` degrees toward the side of the trunk, so that it stays out of the
    trunk under the arm of the A-pose."""
    a, e, w, t = line
    cut = s.spec['cut']
    u = (e - a).normalized()
    tilt = math.radians(cut['tilt'])
    shoulder = (u * math.cos(tilt) + Vector((side, 0, 0)) * math.sin(tilt)).normalized()
    return [(a.lerp(e, cut['shoulder']), shoulder),
            (w + (t - w) * cut['wrist'], (t - w).normalized())]


def arm_stations(s, line):
    """Gives the center line point and the axis of each ring, from the shoulder to the wrist."""
    a, e, w, t = line
    gap = s.units(s.spec['gap'])
    u, f, h = (e - a).normalized(), (w - e).normalized(), (t - w).normalized()
    out = [(a.lerp(e, k), u) for k in tuple(s.spec['upper']) + (1 - gap / (e - a).length,)]
    out.append((e, (u + f).normalized()))
    lo, hi = gap / (w - e).length, 1 - gap / (w - e).length
    count = s.spec['fore']
    out += [(e.lerp(w, lo + (hi - lo) * k / (count + 1)), f) for k in range(count + 2)]
    out.append((w, (f + h).normalized()))
    return out


def ring_faces(s, bm, line, side, point, normal):
    """Finds the faces that a plane crosses in one closed loop around the arm.

    The faces of the arm zone that the plane crosses make loops of crossing points. The closed
    loop nearest to `point` goes around the arm. Gives its faces and its crossing points.
    """
    side_of = {p: (p.co - point).dot(normal) for p in bm.verts}
    near_x = s.units(s.spec['zone']['x'])
    radius = s.units(s.spec['zone']['radius'])
    zone = [f for f in bm.faces if all(p.co.x * side > near_x and arm_distance(line, p.co) < radius
                                       for p in f.verts)]
    links = {}
    for f in zone:
        cross = [e for e in f.edges if side_of[e.verts[0]] * side_of[e.verts[1]] < 0]
        if len(cross) == 2:
            for a, b in (cross, cross[::-1]):
                links.setdefault(a, []).append((b, f))
    seen, best = set(), None
    for e0 in links:
        if e0 in seen:
            continue
        stack, comp = [e0], []
        while stack:
            e = stack.pop()
            if e in seen:
                continue
            seen.add(e)
            comp.append(e)
            stack += [b for b, _ in links[e]]
        if any(len(links[e]) != 2 for e in comp):
            continue
        pts = []
        for e in comp:
            a, b = e.verts
            k = side_of[a] / (side_of[a] - side_of[b])
            pts.append(a.co.lerp(b.co, k))
        center = sum(pts, Vector()) / len(pts)
        if best is None or (center - point).length < (best[2] - point).length:
            best = ({f for e in comp for _, f in links[e]}, pts, center)
    if best is None:
        raise RuntimeError('No closed loop around the arm at %s.' % (tuple(point),))
    return list(best[0]), best[1]


def cut_arm(s, bm, line, side, part):
    """Cuts the arm at the shoulder line and at the wrist (Bisect), and deletes the arm faces.

    The Bisect splits only the faces of the loop around the arm. The faces between the two cuts
    go (Delete Faces). The two cut loops stay as the borders of the trunk and of the paw.
    """
    cut_edges = set()
    for code, (point, normal) in zip(('shoulder', 'wrist'), cut_planes(s, line, side)):
        faces, _ = ring_faces(s, bm, line, side, point, normal)
        edges = {e for f in faces for e in f.edges}
        verts = {p for f in faces for p in f.verts}
        res = bmesh.ops.bisect_plane(bm, geom=list(verts) + list(edges) + faces, plane_co=point,
                                     plane_no=normal, dist=1e-6)
        loop = [e for e in res['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
        for e in loop:
            for p in e.verts:
                p[part] = PART[code] + (0 if side > 0 else 10)
        cut_edges |= set(loop)
    _, e, w, _ = line
    mid = e.lerp(w, 0.5)
    seed = min(bm.faces, key=lambda f: (f.calc_center_median() - mid).length)
    arm, stack = set(), [seed]
    while stack:
        f = stack.pop()
        if f in arm:
            continue
        arm.add(f)
        stack += [g for edge in f.edges if edge not in cut_edges for g in edge.link_faces]
    if len(arm) > s.spec['faces']:
        raise RuntimeError('The cut loops of the arm are open: %d faces reached.' % len(arm))
    bmesh.ops.delete(bm, geom=list(arm), context='FACES')
    return len(arm)


def build_tube(s, bm, line, side, part, spoke):
    """Models the quad tube of one arm: one ring of `RING_VERTS` vertices at each station.

    Each ring stands at a right angle to its bone. Its center is the center of the cross section
    of the source arm, and its radius is the mean radius of that section.
    """
    src = bmesh.new()
    src.from_mesh(s.source.data)
    rings = []
    for point, axis in arm_stations(s, line):
        _, pts = ring_faces(s, src, line, side, point, axis)
        center = sum(pts, Vector()) / len(pts)
        radius = sum((p - center).length for p in pts) / len(pts)
        up = Vector((0, 0, 1))
        ref = (up - axis * axis.dot(up)).normalized()
        across = axis.cross(ref)
        ring = []
        for k in range(RING_VERTS):
            a = 2 * math.pi * k / RING_VERTS
            p = bm.verts.new(center + (ref * math.cos(a) + across * math.sin(a)) * radius)
            p[part] = PART['tube'] + (0 if side > 0 else 10)
            p[spoke] = k
            ring.append(p)
        rings.append(ring)
    src.free()
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(RING_VERTS):
            j = (k + 1) % RING_VERTS
            bm.faces.new((r0[k], r0[j], r1[j], r1[k])).smooth = True
    return rings


def part_group(mesh, name, codes):
    """Makes a vertex group of the vertices whose `arm_part` code is in `codes`."""
    codes = set(codes)
    attr = mesh.data.attributes['arm_part'].data
    group = mesh.vertex_groups.get(name) or mesh.vertex_groups.new(name=name)
    group.add([i for i, a in enumerate(attr) if a.value in codes], 1.0, 'REPLACE')
    return group


def apply_modifier(mesh, mod):
    """Applies a modifier of the mesh (Apply in the modifier panel)."""
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.modifier_apply(modifier=mod.name)


def step_cut_and_tube(s):
    """Keeps a hidden copy of the source mesh, cuts both arms, and models both tubes."""
    mesh = s.mesh
    source = mesh.copy()
    source.data = mesh.data.copy()
    source.name = source.data.name = s.animal + '-source'
    bpy.context.scene.collection.objects.link(source)
    source.hide_render = True
    s.source = source
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(mesh.data)
    part = bm.verts.layers.int.get('arm_part') or bm.verts.layers.int.new('arm_part')
    spoke = bm.verts.layers.int.get('arm_spoke') or bm.verts.layers.int.new('arm_spoke')
    out = {}
    for side in (1, -1):
        line = arm_line(s, side)
        removed = cut_arm(s, bm, line, side, part)
        rings = build_tube(s, bm, line, side, part, spoke)
        out[side] = (removed, len(rings))
    bmesh.update_edit_mesh(mesh.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    source.hide_set(True)
    return out


def step_wrap(s):
    """Puts the tube vertices on the surface of the source arm with a Shrinkwrap modifier.

    The modifier projects each vertex along its normal, in both directions, onto the source copy.
    The tube normals point out from the arm line, so each ring keeps its plane.
    """
    mesh = s.mesh
    s.source.hide_set(False)
    group = part_group(mesh, 'retopo', (PART['tube'], PART['tube'] + 10))
    mod = mesh.modifiers.new('wrap', 'SHRINKWRAP')
    mod.target = s.source
    mod.wrap_method = 'PROJECT'
    mod.use_project_x = mod.use_project_y = mod.use_project_z = False
    mod.use_negative_direction = True
    mod.use_positive_direction = True
    mod.cull_face = 'OFF'
    mod.vertex_group = group.name
    apply_modifier(mesh, mod)
    mesh.vertex_groups.remove(mesh.vertex_groups['retopo'])
    s.source.hide_set(True)


def edge_loops(edges):
    """Splits edges into the groups of edges that share vertices: the closed loops."""
    left, out = set(edges), []
    while left:
        stack, group = [left.pop()], []
        while stack:
            e = stack.pop()
            group.append(e)
            for p in e.verts:
                for g in p.link_edges:
                    if g in left:
                        left.remove(g)
                        stack.append(g)
        out.append(group)
    return out


def loop_center(edges):
    """Gives the mean place of the vertices of edges."""
    verts = {p for e in edges for p in e.verts}
    return sum((p.co for p in verts), Vector()) / len(verts)


#: The twist offsets of Bridge Edge Loops that `bridge_twist()` tries.
TWISTS = range(-12, 13)


def bridge_twist(bm, edges):
    """Gives the twist offset of Bridge Edge Loops (the Twist field of the operator) that joins two
    loops with the shortest new edges. On the wrists of the cat of the A-pose mesh, the offsets 1 and
    2 gave shorter edges than the default 0. The offset 0 wins a tie."""
    bm.edges.ensure_lookup_table()
    indices = [e.index for e in edges]
    best, best_length = 0, None
    for twist in sorted(TWISTS, key=abs):
        tmp = bm.copy()
        tmp.edges.ensure_lookup_table()
        res = bmesh.ops.bridge_loops(tmp, edges=[tmp.edges[i] for i in indices], twist_offset=twist)
        length = sum(e.calc_length() for f in res['faces'] for e in f.edges)
        tmp.free()
        if best_length is None or length < best_length - 1e-9:
            best, best_length = twist, length
    return best


def step_bridge(s):
    """Joins each tube to the trunk and to the paw with Bridge Edge Loops.

    The first ring bridges to the cut loop of the shoulder line, and the last ring to the cut loop
    of the paw. The loops have more vertices than the rings, so the bridge makes triangles.
    """
    mesh = s.mesh
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(mesh.data)
    part = bm.verts.layers.int['arm_part']
    made = 0
    for off in (0, 10):
        tube = PART['tube'] + off
        ring_edges = [e for e in bm.edges if e.is_boundary and all(p[part] == tube for p in e.verts)]
        rings = edge_loops(ring_edges)
        for code in ('shoulder', 'wrist'):
            loop = [e for e in bm.edges if e.is_boundary
                    and all(p[part] == PART[code] + off for p in e.verts)]
            center = loop_center(loop)
            # The end ring of the tube nearest to this cut loop. The plane of the shoulder line
            # leans to the ring, so a distance from the center does not select the whole ring.
            ring = min(rings, key=lambda r: (loop_center(r) - center).length)
            res = bmesh.ops.bridge_loops(bm, edges=loop + ring,
                                         twist_offset=bridge_twist(bm, loop + ring))
            for f in res['faces']:
                f.smooth = True
            made += len(res['faces'])
    bmesh.update_edit_mesh(mesh.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    return made


def step_beautify(s):
    """Runs Beautify Faces on the bridge triangles of each arm. Bridge Edge Loops joins a ring of
    16 vertices to a cut loop with more vertices, and some of its triangles are slivers with a
    corner of less than 2°, which fold at the left wrist of the rabbit in each play sample."""
    mesh = s.mesh
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(mesh.data)
    part = bm.verts.layers.int['arm_part']
    tubes = (PART['tube'], PART['tube'] + 10)
    bridge = [f for f in bm.faces if len(f.verts) == 3
              and any(p[part] in tubes for p in f.verts) and any(p[part] not in tubes for p in f.verts)
              and all(p[part] > 0 for p in f.verts)]
    inner = [e for e in {e for f in bridge for e in f.edges}
             if len(e.link_faces) == 2 and all(g in bridge for g in e.link_faces)]
    res = bmesh.ops.beautify_fill(bm, faces=bridge, edges=inner)
    for f in res['geom']:
        if isinstance(f, bmesh.types.BMFace):
            f.smooth = True
    bmesh.update_edit_mesh(mesh.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    return len(bridge)


def arm_faces(bm, part):
    """Gives the new faces of the arms: the tube faces and the bridge faces."""
    return [f for f in bm.faces if all(p[part] > 0 for p in f.verts)
            and any(p[part] in (PART['tube'], PART['tube'] + 10) for p in f.verts)]


def arm_material(s):
    """Gives the name of the material of the new arm faces."""
    return s.animal + '-arms'


def step_uv(s):
    """Gives the new arm faces their own material, a seam on each tube, and a new UV layout.

    The atlas of the source has many UV islands on each arm, so a UV transfer would cross island
    borders. The new faces get their own material, Mark Seam along `SEAM_SPOKE` and one bridge
    edge at each end, Unwrap, and Pack Islands. `step_bake()` then fills its image.
    """
    mesh = s.mesh
    name = arm_material(s)
    size = s.spec['texture']
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    image = bpy.data.images.get(name) or bpy.data.images.new(name, size, size)
    tex = next((n for n in nodes if n.type == 'TEX_IMAGE'), None) or nodes.new('ShaderNodeTexImage')
    tex.image = image
    mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    nodes.active = tex
    if mat.name not in mesh.data.materials:
        mesh.data.materials.append(mat)
    index = list(mesh.data.materials).index(mat)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(mesh.data)
    part = bm.verts.layers.int['arm_part']
    spoke = bm.verts.layers.int['arm_spoke']
    faces = arm_faces(bm, part)
    tubes = (PART['tube'], PART['tube'] + 10)
    for f in bm.faces:
        f.select = False
    for f in faces:
        f.material_index = index
        f.select = True
    for e in bm.edges:
        a, b = e.verts
        if a[part] in tubes and b[part] in tubes:
            e.seam = a[spoke] == SEAM_SPOKE and b[spoke] == SEAM_SPOKE
    # One bridge edge at each tube end continues the seam to the cut loop.
    for p in bm.verts:
        if p[part] in tubes and p[spoke] == SEAM_SPOKE:
            out = [e for e in p.link_edges if e.other_vert(p)[part] not in tubes]
            if out:
                min(out, key=lambda e: e.calc_length()).seam = True
    bm.select_flush_mode()
    bmesh.update_edit_mesh(mesh.data)
    # With the UV sync selection on, Unwrap and Pack Islands touch only the selected faces.
    tools = bpy.context.scene.tool_settings
    sync = tools.use_uv_select_sync
    tools.use_uv_select_sync = True
    bpy.ops.uv.unwrap(method='ANGLE_BASED', margin=0.01)
    bpy.ops.uv.pack_islands(margin=0.01, rotate=True)
    tools.use_uv_select_sync = sync
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    return len(faces)


def step_bake(s):
    """Bakes the fur color of the source arms onto the image of the new arm faces.

    A copy of the mesh keeps only the new arm faces, so the bake writes only the arm image.
    Cycles bakes the Diffuse Color from the source copy (Selected to Active).
    """
    mesh, source = s.mesh, s.source
    scene = bpy.context.scene
    engine = scene.render.engine
    bpy.ops.object.select_all(action='DESELECT')
    target = mesh.copy()
    target.data = mesh.data.copy()
    target.name = s.animal + '-arm-bake'
    scene.collection.objects.link(target)
    bm = bmesh.new()
    bm.from_mesh(target.data)
    part = bm.verts.layers.int['arm_part']
    keep = set(arm_faces(bm, part))
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f not in keep], context='FACES')
    bm.to_mesh(target.data)
    bm.free()
    target.data.materials.clear()
    target.data.materials.append(bpy.data.materials[arm_material(s)])
    for poly in target.data.polygons:
        poly.material_index = 0
    source.hide_set(False)
    source.hide_render = False
    source.select_set(True)
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 16
    scene.render.bake.margin = 8
    cage, reach = s.spec.get('bake', (0.006, 0.017))
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, use_selected_to_active=True,
                        cage_extrusion=s.units(cage), max_ray_distance=s.units(reach),
                        margin=8)
    scene.render.engine = engine
    bpy.data.objects.remove(target, do_unlink=True)
    source.hide_render = True
    source.hide_set(True)
    image = bpy.data.images[arm_material(s)]
    image.pack()
    return image


def step_normals(s):
    """Gives the new arm faces and the cut loops the custom normals of the source surface.

    A Data Transfer modifier copies the face corner normals of the nearest source face
    (interpolated) onto the vertices of the tubes, the bridges, and the cut loops. The seams then
    have the same normal on both sides. The source copy then goes.
    """
    mesh = s.mesh
    s.source.hide_set(False)
    group = part_group(mesh, 'retopo', [c + off for c in PART.values() for off in (0, 10)])
    mod = mesh.modifiers.new('normals', 'DATA_TRANSFER')
    mod.object = s.source
    mod.use_loop_data = True
    mod.data_types_loops = {'CUSTOM_NORMAL'}
    mod.loop_mapping = 'POLYINTERP_NEAREST'
    mod.vertex_group = group.name
    apply_modifier(mesh, mod)
    mesh.vertex_groups.remove(mesh.vertex_groups['retopo'])
    bpy.data.objects.remove(s.source, do_unlink=True)
    s.source = None


def smoothstep(x, low, high):
    """Gives the smooth step from 0 at `low` to 1 at `high`, as `smoothstep()` of `rig_mesh.py`."""
    t = min(max((x - low) / (high - low), 0.0), 1.0)
    return t * t * (3 - 2 * t)


#: The share of the upper arm, from the shoulder cut, over which the stretch grows from zero, as
#: `SHOULDER_ZONE` of the Rigify rabbit (`tools/blender/rigify_rabbit.py` of the branch
#: `rigify-rabbit`). The trunk and the shoulder line stay, and the stretch starts smoothly.
SHOULDER_ZONE = 0.4

#: The share of the upper arm from the shoulder joint over which the factor of its cross-section
#: grows from 0 to all, as `ARM_GIRTH_FADE` of `rig_mesh.py`.
ARM_GIRTH_FADE = 0.4


def stretch_ramp(x):
    """Gives the share of the upper arm stretch at a share x of the way from the shoulder cut to
    the elbow: a smooth start over `SHOULDER_ZONE`, then a straight line to 1 at the elbow."""
    a = SHOULDER_ZONE
    x = min(max(x, 0.0), 1.0)
    y = x * x / (2 * a) if x < a else x - a / 2
    return y / (1 - a / 2)


def arm_verts(s, bm, part, off):
    """Gives the vertices of one arm: the tube, the wrist loop, and the paw, which the tube reaches
    with no step over the cut loop of the shoulder line."""
    arm, stack = set(), [p for p in bm.verts if p[part] == PART['tube'] + off]
    while stack:
        p = stack.pop()
        if p in arm:
            continue
        arm.add(p)
        if p[part] != PART['shoulder'] + off:
            stack += [edge.other_vert(p) for edge in p.link_edges]
    return arm


def step_shape(s):
    """Gives each arm the cross-section and the length of the app body, as the rules `armGirth`
    and `armFactor` of the config give them to the arm bones of a rig with no arm segments.

    First, the tube vertices move toward the arm axis: the upper arm takes `slim[0]` across its
    axis, with a fade from the shoulder joint over `ARM_GIRTH_FADE` of its length, and the forearm
    takes `slim[1]`, with a fade to the wrist (`arm_slim()` and `fore_slim()` of `rig_mesh.py`).
    Then each arm becomes `factor` times longer along its bones (`arm_factors()`), from the
    shoulder cut: a point of the upper arm moves along the upper arm by its share of the stretch
    of the upper arm (`stretch_ramp()`), and a point of the forearm also moves along the forearm by
    its share of the stretch of the forearm. The paw moves as one piece, and the shoulder cut loop
    stays. The UVs and the custom normals stay.
    """
    (upper, fore), (slim_upper, slim_fore) = arm_factors(s.spec['factor']), s.spec['slim']
    mesh = s.mesh
    bm = bmesh.new()
    bm.from_mesh(mesh.data)
    bm.verts.ensure_lookup_table()
    part = bm.verts.layers.int['arm_part']
    moves = {}
    for side, off in ((1, 0), (-1, 10)):
        line = arm_line(s, side)
        a, e, w, _ = line
        u, f = (e - a).normalized(), (w - e).normalized()
        lu, lf = (e - a).length, (w - e).length
        point, normal = cut_planes(s, line, side)[0]
        for p in arm_verts(s, bm, part, off):
            co = p.co.copy()
            if p[part] == PART['tube'] + off:
                if (co - e).dot(u + f) < 0:
                    rel = co - a
                    along = rel.dot(u)
                    across = rel - u * along
                    fade = smoothstep(along, 0.0, ARM_GIRTH_FADE * lu)
                    co -= across * ((1 - slim_upper) * fade)
                else:
                    rel = co - e
                    along = rel.dot(f)
                    across = rel - f * along
                    fade = 1 - smoothstep(along, 0.0, lf)
                    co -= across * ((1 - slim_fore) * fade)
            d = co - a
            along = d.dot(u)
            # The place of the shoulder cut plane on the line of this point, along the bone.
            cut = ((point - a).dot(normal) - (d - u * along).dot(normal)) / u.dot(normal)
            x = (along - cut) / (lu - cut)
            t = min(max((co - e).dot(f) / lf, 0.0), 1.0)
            moves[p.index] = co + (u * (lu * (upper - 1) * stretch_ramp(x))
                                   + f * (lf * (fore - 1) * t))
    bm.free()
    for i, co in moves.items():
        mesh.data.vertices[i].co = co
    mesh.data.update()
    return len(moves)


def prepare_material(mesh):
    """Keeps only the base color of the material: no metallic and roughness texture, which the rig
    does not read."""
    mat = mesh.data.materials[0]
    nodes = mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    for name in ('Metallic', 'Roughness'):
        for link in list(bsdf.inputs[name].links):
            mat.node_tree.links.remove(link)
    base = bsdf.inputs['Base Color'].links[0].from_node
    for n in list(nodes):
        if (n.type == 'TEX_IMAGE' and n != base) or n.type == 'SEPARATE_COLOR':
            nodes.remove(n)


def step_atlas(s):
    """Puts the arm image in a strip on top of the atlas of the source, so that the mesh keeps one
    material and one image (`pnpm rig-mesh` reads one base color texture).

    The new image is the width of the atlas and the arm image higher. The atlas keeps its pixels
    in the rows from 0, and the arm image goes into the strip at the left. The UVs of each face
    move to the place of its pixels, and the arm faces take the material of the source.
    """
    import numpy as np

    mesh = s.mesh
    prepare_material(mesh)
    fur = mesh.data.materials[0]
    bsdf = next(n for n in fur.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    atlas = bsdf.inputs['Base Color'].links[0].from_node.image
    arms = bpy.data.images[arm_material(s)]
    width, height = atlas.size
    size = arms.size[0]
    pixels = np.zeros((height + size, width, 4), np.float32)
    pixels[:, :, 3] = 1.0
    source = np.empty(width * height * 4, np.float32)
    atlas.pixels.foreach_get(source)
    pixels[:height] = source.reshape(height, width, 4)
    strip = np.empty(size * size * 4, np.float32)
    arms.pixels.foreach_get(strip)
    pixels[height:, :size] = strip.reshape(size, size, 4)
    image = bpy.data.images.new(s.animal + '-fur', width, height + size)
    image.colorspace_settings.name = atlas.colorspace_settings.name
    image.pixels.foreach_set(pixels.ravel())
    image.pack()
    total = height + size
    arm_index = list(mesh.data.materials).index(bpy.data.materials[arm_material(s)])
    uv = mesh.data.uv_layers.active.data
    for poly in mesh.data.polygons:
        for li in poly.loop_indices:
            u, v = uv[li].uv
            if poly.material_index == arm_index:
                uv[li].uv = (u * size / width, (height + v * size) / total)
            else:
                uv[li].uv = (u, v * height / total)
        poly.material_index = 0
    mesh.data.materials.pop(index=arm_index)
    node = bsdf.inputs['Base Color'].links[0].from_node
    node.image = image
    bpy.context.view_layer.objects.active = mesh
    return image


def step_export(s):
    """Writes the mesh with the new arms as the source of the rig: one mesh, one material with the
    base color image, no skin. The image is a JPEG at the quality 92."""
    path = os.path.join(s.out_dir, s.animal + '-arms.glb')
    bpy.ops.object.select_all(action='DESELECT')
    s.mesh.select_set(True)
    bpy.context.view_layer.objects.active = s.mesh
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=False,
        export_skins=False, export_morph=False, export_animations=False,
        export_image_format='JPEG', export_jpeg_quality=92, export_extras=False,
        export_attributes=False)
    return os.path.getsize(path)


def rig_mesh(config=None):
    """Loads the functions of `rig_mesh.py` with no run of its main step. With a config, the bones
    get the tip of a tail of two bones and the jaw of a config that has them, as `main()` of
    `rig_mesh.py` adds them."""
    path = os.path.join(ROOT, 'tools', 'blender', 'rig_mesh.py')
    with open(path) as f:
        source = f.read().rstrip()
    source = source[: -len('main()')]
    names = {'__name__': 'rig_mesh_lib', '__file__': path}
    exec(compile(source, path, 'exec'), names)
    for bone in ('TAIL_TIP', 'JAW'):
        if config and names[bone] in config['joints']:
            names['BONES'] = names['BONES'] + (names[bone],)
    return names


#: The bones that move no vertex in this rig: the root, and the arm bones whose segments and
#: helpers take their vertices. The pose code of the app turns them, and they drive the segments.
DRIVERS = ('root',) + tuple(f'{b}_{s}' for s in 'LR'
                            for b in ('upper_arm', 'forearm', 'forearm_twist'))


def step_skeleton(s):
    """Adds the studio skeleton with the arm segments and the helpers (`armSegments` of the
    config) at the joints of the config. Each helper spans its joint for the bind: its middle is on
    the joint, so that the bone heat gives it the rings of the joint."""
    rm = rig_mesh(s.config)
    fr = s.fr
    heads, ends, rolls, children = rm['joints_of'](s.config)
    rm['segment_joints'](heads, ends, rolls, children, s.config['armSegments'])
    names = rm['BONES'] + rm['segment_bones']()
    rig = bpy.data.objects.new('studio-rig', bpy.data.armatures.new('studio-rig'))
    bpy.context.scene.collection.objects.link(rig)
    rig.show_in_front = True
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for name in names:
        bone = rig.data.edit_bones.new(name)
        head, tail = heads[name], ends[name]
        if name in rm['SEGMENT_PARENTS'] and name.split('_')[0] in ('elbow', 'wrist'):
            half = (tail - head) / 2
            head, tail = head - half, tail - half
        bone.head, bone.tail = fr.point(head), fr.point(tail)
        bone.align_roll(Vector(rm['to_blender'](rolls[name]).tolist()))
        bone.use_deform = name not in DRIVERS
    for name in names:
        parent = rm['PARENTS'][name]
        if parent:
            rig.data.edit_bones[name].parent = rig.data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    s.rig = rig
    return rig


def paint_mode(mesh, select=None):
    """Enters Weight Paint mode, with the vertex mask on the vertices where `select` is true."""
    bpy.context.view_layer.objects.active = mesh
    if mesh.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    if select is not None:
        for p in mesh.data.vertices:
            p.select = bool(select(p))
        mesh.data.update()
    bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
    mesh.data.use_paint_mask_vertex = select is not None


def limit_and_normalize():
    """Limits each vertex to 4 deform weights and normalizes them (Weight Paint operators)."""
    bpy.ops.object.vertex_group_limit_total(group_select_mode='BONE_DEFORM', limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='BONE_DEFORM', lock_active=False)


def step_bind(s):
    """Parents the mesh to the rig with automatic weights, then Limit Total 4 and Normalize All."""
    bpy.ops.object.select_all(action='DESELECT')
    s.mesh.select_set(True)
    s.rig.select_set(True)
    bpy.context.view_layer.objects.active = s.rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    paint_mode(s.mesh)
    limit_and_normalize()
    bpy.ops.object.mode_set(mode='OBJECT')


def drive_in_blender(rig):
    """Adds Copy Rotation constraints that turn the segments and the helpers in Blender about as
    the app turns them, for the test poses of the weight fixes. Each forearm segment copies its
    share of the twist of the paw (the Y axis, in local space), and each helper copies half of the
    turn of the bone after its joint (world space). The app ignores the constraints: `poseArm()`
    of `src/models/studio-rig.ts` turns the bones."""
    rm = rig_mesh()
    for side in 'LR':
        for k in range(rm['ARM_SEGMENTS']):
            pb = rig.pose.bones[f'forearm_seg{k}_{side}']
            con = pb.constraints.get('twist') or pb.constraints.new('COPY_ROTATION')
            con.name = 'twist'
            con.target, con.subtarget = rig, f'hand_{side}'
            con.use_x = con.use_z = False
            con.mix_mode = 'ADD'
            con.target_space = con.owner_space = 'LOCAL'
            con.influence = rm['segment_share'](k)
        for name, target in ((f'elbow_{side}', f'forearm_{side}'), (f'wrist_{side}', f'hand_{side}')):
            pb = rig.pose.bones[name]
            con = pb.constraints.get('half') or pb.constraints.new('COPY_ROTATION')
            con.name = 'half'
            con.target, con.subtarget = rig, target
            con.mix_mode = 'REPLACE'
            con.target_space = con.owner_space = 'WORLD'
            con.influence = 0.5


def test_pose(rig, down=40.0, forward=30.0, elbow=100.0, twist=90.0):
    """Poses both arms for a look at the weights: each upper arm turns `down` degrees down and
    `forward` degrees forward, each elbow bends `elbow` degrees forward, and each paw turns `twist`
    degrees about its own axis. Zero for all gives the rest pose."""
    from mathutils import Euler
    pose = rig.pose.bones
    for side, sign in (('L', 1), ('R', -1)):
        for b in ('upper_arm', 'forearm', 'hand'):
            pose[f'{b}_{side}'].rotation_mode = 'XYZ'
        pose[f'upper_arm_{side}'].rotation_euler = Euler((math.radians(down), 0,
                                                          math.radians(sign * forward)))
        pose[f'forearm_{side}'].rotation_euler = Euler((0, 0, math.radians(sign * elbow)))
        pose[f'hand_{side}'].rotation_euler = Euler((0, math.radians(sign * twist), 0))
    bpy.context.view_layer.update()


def remove_from(mesh, names):
    """Removes the selected vertices from the vertex groups (Remove From Group)."""
    vg = mesh.vertex_groups
    for name in names:
        if name in vg:
            vg.active_index = vg[name].index
            bpy.ops.object.vertex_group_remove_from()


def arm_groups(sides='LR'):
    """Lists the vertex groups of the arm segments and of the helpers."""
    rm = rig_mesh()
    return [n for n in rm['segment_bones']() if n[-1] in sides]


def step_paint(s):
    """Paints the fixes of the session with the Weight Paint tools, in the order of the session.
    The places are in the units of the studio (`Frame`), from `paint` of the animal.

    1. Trunk under the armpits: Remove From Group of the arm bones inside |x| `trunk.x`, from
       `trunk.y[0]` to `trunk.y[1]`, so that the side of the trunk does not follow the arm.
    2. Shoulder line: Smooth on the band of the arm root (`root`), so that the weights of the long
       faces of the armpit change gradually.
    3. Arms: Smooth on the vertices that hang at least 0.6 on the arm bones, so that the turn
       changes gradually from one segment to the next.
    """
    mesh, fr, paint = s.mesh, s.fr, s.spec['paint']

    def place(p):
        return (abs(p.co.x) / fr.height, (p.co.z - fr.floor) / fr.height)

    arms = arm_groups()
    trunk, root = paint['trunk'], paint['root']
    paint_mode(mesh, lambda p: place(p)[0] < trunk['x'] and trunk['y'][0] < place(p)[1] < trunk['y'][1])
    remove_from(mesh, arms)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='BONE_DEFORM', lock_active=False)
    paint_mode(mesh, lambda p: root['x'][0] < place(p)[0] < root['x'][1]
               and root['y'][0] < place(p)[1] < root['y'][1])
    bpy.ops.object.vertex_group_smooth(group_select_mode='BONE_DEFORM', factor=0.5, repeat=6)
    limit_and_normalize()
    bpy.ops.object.mode_set(mode='OBJECT')
    names = {g.index: g.name for g in mesh.vertex_groups}
    arm_set = set(arms) | {f'hand_{side}' for side in 'LR'}
    paint_mode(mesh, lambda p: sum(g.weight for g in p.groups if names[g.group] in arm_set) > 0.6)
    bpy.ops.object.vertex_group_smooth(group_select_mode='BONE_DEFORM', factor=0.5, repeat=4)
    limit_and_normalize()
    bpy.ops.object.mode_set(mode='OBJECT')
    mesh.data.use_paint_mask_vertex = False


def step_weights(s):
    """Writes the weights for `paintedWeights` of the config: the deform bones, the place of each
    vertex in the units of the studio, and its weights."""
    rm = rig_mesh()
    mesh, rig, fr = s.mesh, s.rig, s.fr
    bones = [b.name for b in rig.data.bones if b.use_deform]
    names = {g.index: g.name for g in mesh.vertex_groups}
    rows, points = [], []
    for vert in mesh.data.vertices:
        w = {names[g.group]: g.weight for g in vert.groups if g.weight > 0}
        rows.append([round(w.get(b, 0.0), 6) for b in bones])
        p = rm['from_blender']([vert.co[:]])[0]
        points.append([round(float(p[0]) / fr.height, 7),
                       round((float(p[1]) - fr.floor) / fr.height, 7),
                       round(float(p[2]) / fr.height, 7)])
    data = {'note': 'Weights of the %s with the rebuilt arms, painted in Blender on 2026-10-24 '
                    '(tools/blender/violin_arms.py): automatic weights and Weight Paint fixes. '
                    'Points in the units of the studio.' % s.animal,
            'bones': bones, 'points': points, 'weights': rows}
    path = os.path.join(s.out_dir, s.animal + '-weights.json')
    with open(path, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    return len(rows)


#: The steps of the session, in order.
STEPS = (import_mesh, step_cut_and_tube, step_wrap, step_bridge, step_beautify, step_uv, step_bake,
         step_normals, step_shape, step_atlas, step_export, step_skeleton, step_bind, step_paint,
         step_weights)


def clear_scene():
    """Removes all objects of the scene."""
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)


def run_steps(s, first=0, last=len(STEPS)):
    """Runs the steps from `first` up to `last` (not included), and prints the result of each."""
    for step in STEPS[first:last]:
        print('%s: %s' % (step.__name__, step(s)))


def main():
    """Runs the steps of the session and writes the source mesh and the weights into the out dir
    (the folder of the animal in `assets/models/` by default)."""
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    animal = argv[0]
    out_dir = os.path.abspath(argv[1]) if len(argv) > 1 else None
    clear_scene()
    s = Session(animal, out_dir)
    run_steps(s)
    print('violin_arms: wrote %s-arms.glb and %s-weights.json into %s'
          % (animal, animal, s.out_dir))


if __name__ == '__main__':
    main()
