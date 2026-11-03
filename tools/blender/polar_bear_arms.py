"""Replays the Blender session that rebuilds the arms of the polar bear pianist.

The rebuild uses the quad arms of the Rigify rabbit. The session makes these steps in the live
Blender through MCP, with an image after each step, and this script repeats them in the same
order:

1. Import the T-pose mesh (`polar-bear-tpose.glb`) and Merge by Distance.
2. Replace the faces of each arm from the shoulder line to the wrist with a quad tube: Bisect at
   the shoulder line and at the wrist (parallel to the last ring of the tube),
   Delete Faces, Collapse Edges of the thin faces at each wrist cut loop, a tube of
   `len(stations)` rings of `RING_VERTS`, Shrinkwrap onto the source arm, Bridge Edge Loops to the
   trunk and to the paw, Collapse Edges of the thin wrist bridge faces, Smooth Vertices on the band
   of each wrist, and a Shrinkwrap of the band back onto the source arm. The faces of the paws, the
   trunk, the legs, and the head stay.
3. Give the new arm faces a UV layout, bake the fur color of the source arm onto them (Cycles,
   Selected to Active), and transfer the custom normals of the source surface (Data Transfer).
4. Put the arm image in a strip below the atlas, so that the mesh keeps one material, and write
   the new source `polar-bear-arms.glb`.
5. Add the studio skeleton with the arm segments and the elbow and wrist helpers
   (`armSegments` of `tools/mesh-rigs/polar-bear.json`), parent with automatic weights, and paint
   the fixes with the Weight Paint tools (`paint_weights()`).
6. Write the weights for `paintedWeights` of the config (`polar-bear-weights.json`).

Then `pnpm rig-mesh polar-bear` and `pnpm studio-body polar-bear` make the app body. The app
drives the segments and the helpers from the joints of the pose (`poseArm()` of
`src/models/studio-rig.ts`).

Run it in a terminal from the root of the tree:

    Blender -b --factory-startup -P tools/blender/polar_bear_arms.py -- [<out dir>]
"""

import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CONFIG = os.path.join(ROOT, 'tools', 'mesh-rigs', 'polar-bear.json')
SOURCE = os.path.join(ROOT, 'assets', 'models', 'polar-bear', 'polar-bear-tpose.glb')

#: The weld of Merge by Distance, in meters of the source, as `weld` of the config.
WELD = 1e-5


class Frame:
    """Converts the units of the studio (1 unit from the soles to the skull top, y up, +z forward)
    to the meters of the source in Blender (z up, -y forward)."""

    def __init__(self, mesh):
        heights = [p.co.z for p in mesh.data.vertices]
        self.floor = min(heights)
        self.height = max(heights) - self.floor

    def point(self, p, side=1):
        """Gives a point of the studio in Blender. Side -1 mirrors it to the right side."""
        return Vector((p[0] * side * self.height, -p[2] * self.height,
                       p[1] * self.height + self.floor))

    def units(self, meters):
        """Gives a length in meters in the units of the studio."""
        return meters / self.height


def load_config():
    """Reads the rig config of the polar bear."""
    with open(CONFIG) as f:
        return json.load(f)


def import_mesh(source=SOURCE):
    """Imports the source mesh and merges the vertices at its UV seams (Merge by Distance).

    The glTF import splits the vertices at each UV seam. Merge by Distance joins them again, as a
    rigger does before a retopology or automatic weights. The UVs stay on the face corners.
    """
    bpy.ops.import_scene.gltf(filepath=source)
    mesh = [o for o in bpy.context.selected_objects if o.type == 'MESH'][0]
    mesh.name = mesh.data.name = 'polar-bear'
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=WELD)
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    return mesh


def seg_distance(p, a, b):
    """Gives the distance from point p to the segment from a to b."""
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length


# The retopology of the arms: quad arms, as on the Rigify rabbit. The cuts, in the units of the
# studio: the shoulder line at the share `shoulder` of the upper arm from the shoulder joint
# (x 0.154, where the T-pose arm is free of the trunk), and the wrist at the share `wrist` of the
# paw from the wrist joint, along the axis of the last ring of the tube (`cut_planes()`). The
# faces of the trunk, the head, the legs, and the paws stay.
ARM_CUT = {'shoulder': 0.15, 'wrist': 0.25}

# The quad tube: `RING_VERTS` vertices in each ring. Rings at the shares `UPPER_RINGS` of the upper
# arm, three rings at the elbow (the joint and `JOINT_GAP` units to each side), and `FORE_RINGS`
# inner rings of the forearm. At the wrist, the ring `JOINT_GAP` before the joint, the ring at the
# joint, and the cut loop of the paw make the three rings. The bear arm is about twice as thick as
# the rabbit arm, so the gap is about twice the 1.5 cm of the rabbit.
RING_VERTS = 16
JOINT_GAP = 0.015
UPPER_RINGS = (0.3, 0.45, 0.6, 0.75)
FORE_RINGS = 6

# The zone of the faces of one arm, in the units of the studio: out from |x| `ARM_ZONE['x']`,
# and within `ARM_ZONE['radius']` of the arm line.
ARM_ZONE = {'x': 0.09, 'radius': 0.12}

# The codes of the vertex attribute `arm_part` (the left side; the right side adds 10).
PART = {'shoulder': 1, 'wrist': 2, 'tube': 3}


def arm_line(fr, joints, side):
    """Gives the shoulder, the elbow, the wrist, and the finger tip of one arm in Blender."""
    return [fr.point(joints['upper_arm_L']['head'], side), fr.point(joints['forearm_L']['head'], side),
            fr.point(joints['hand_L']['head'], side), fr.point(joints['fingers_L']['tail'], side)]


def arm_distance(line, co):
    """Gives the distance from a point to the arm line from the shoulder to the finger tip."""
    return min(seg_distance(co, line[i], line[i + 1]) for i in range(3))


def cut_planes(line):
    """Gives the cut plane (point, normal) at the shoulder line and at the wrist.

    The wrist plane stands parallel to the last ring of the tube: the ring stands at the wrist
    joint at a right angle to the line halfway between the forearm and the paw
    (`arm_stations()`). The paw of the T-pose turns about 14 degrees down from the forearm. With
    a plane at a right angle to the paw, 0.1 of the paw from the joint, the band from the ring to
    the cut loop is 15 mm wide on the top of the wrist and 2 mm on the palm side. Its thin faces
    turn sharp in the seated bind and show as a crease around the wrist. With the two planes
    parallel, the band is about as wide all around.
    """
    s, e, w, t = line
    axis = ((w - e).normalized() + (t - w).normalized()).normalized()
    return [(s.lerp(e, ARM_CUT['shoulder']), (e - s).normalized()),
            (w + axis * ((t - w).length * ARM_CUT['wrist']), axis)]


def arm_stations(fr, line):
    """Gives the center line point and the axis of each ring, from the shoulder to the wrist."""
    s, e, w, t = line
    gap = JOINT_GAP * fr.height
    u, f, h = (e - s).normalized(), (w - e).normalized(), (t - w).normalized()
    out = [(s.lerp(e, k), u) for k in UPPER_RINGS + (1 - gap / (e - s).length,)]
    out.append((e, (u + f).normalized()))
    a, b = gap / (w - e).length, 1 - gap / (w - e).length
    out += [(e.lerp(w, a + (b - a) * k / (FORE_RINGS + 1)), f) for k in range(FORE_RINGS + 2)]
    out.append((w, (f + h).normalized()))
    return out


def ring_faces(bm, fr, line, side, point, normal):
    """Finds the faces that a plane crosses in one closed loop around the arm.

    The faces of the arm zone that the plane crosses make loops of crossing points. The closed
    loop nearest to `point` goes around the arm. Gives its faces and its crossing points.
    """
    side_of = {p: (p.co - point).dot(normal) for p in bm.verts}
    near_x = ARM_ZONE['x'] * fr.height
    radius = ARM_ZONE['radius'] * fr.height
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


def cut_arm(bm, fr, line, side, part):
    """Cuts the arm at the shoulder line and at the wrist (Bisect), and deletes the arm faces.

    The Bisect splits only the faces of the loop around the arm. The faces between the two cuts
    go (Delete Faces). The two cut loops stay as the borders of the trunk and of the paw.
    """
    cut_edges = set()
    for code, (point, normal) in zip(('shoulder', 'wrist'), cut_planes(line)):
        faces, _ = ring_faces(bm, fr, line, side, point, normal)
        edges = {e for f in faces for e in f.edges}
        verts = {p for f in faces for p in f.verts}
        res = bmesh.ops.bisect_plane(bm, geom=list(verts) + list(edges) + faces, plane_co=point,
                                     plane_no=normal, dist=1e-6)
        loop = [e for e in res['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
        for e in loop:
            for p in e.verts:
                p[part] = PART[code] + (0 if side > 0 else 10)
        cut_edges |= set(loop)
    s, e, w, t = line
    mid = e.lerp(w, 0.5)
    seed = min(bm.faces, key=lambda f: (f.calc_center_median() - mid).length)
    arm, stack = set(), [seed]
    while stack:
        f = stack.pop()
        if f in arm:
            continue
        arm.add(f)
        stack += [g for edge in f.edges if edge not in cut_edges for g in edge.link_faces]
    if len(arm) > 900:
        raise RuntimeError('The cut loops of the arm are open: %d faces reached.' % len(arm))
    bmesh.ops.delete(bm, geom=list(arm), context='FACES')
    return len(arm)


#: The smallest corner of a face at a wrist cut loop or of a wrist bridge face, in degrees: a
#: thinner face collapses its shortest loop edge (`clean_wrist_cut()`, `clean_wrist_bridge()`), as
#: `clean_cut()` and `clean_bridge()` of `polar_bear_legs.py` do. At the wrist of the bear, 20
#: degrees broke the paw into a dark notch (`bear_arms.py`).
CUT_ANGLE = 12.0


def clean_wrist_cut(bm, part, side):
    """Collapses the thin faces at the wrist cut loop of one side (Collapse Edges), before the tube.

    The Bisect splits each face that the plane crosses. Near a corner or along an edge, it leaves
    loop vertices close together: on the left cut, loop vertices lie 1 degree or less apart
    around the arm at three places. While a face at the loop has a corner below
    `CUT_ANGLE` and its shortest edge lies along the loop, that edge collapses to its middle. Gives
    the number of collapsed edges.
    """
    loop = PART['wrist'] + (0 if side > 0 else 10)
    count = 0
    for _ in range(200):
        edge = None
        for f in bm.faces:
            along = [e for e in f.edges if all(p[part] == loop for p in e.verts)]
            if not along or min(math.degrees(c.calc_angle()) for c in f.loops) >= CUT_ANGLE:
                continue
            short = min(f.edges, key=lambda e: e.calc_length())
            if short in along:
                edge = short
                break
        if edge is None:
            break
        bmesh.ops.collapse(bm, edges=[edge], uvs=True)
        count += 1
    return count


def clean_wrist_bridge(bm, part):
    """Collapses the thin bridge triangles of each wrist (Collapse Edges), after the bridge.

    The cut loop of a wrist has about twice as many vertices as the ring, so some bridge triangles
    have two loop vertices close together and a corner below `CUT_ANGLE`. When their edge along
    the loop is their shortest edge, it collapses to its middle. Gives the number of collapsed
    edges.
    """
    loops = {PART['wrist'], PART['wrist'] + 10}
    tubes = {PART['tube'], PART['tube'] + 10}
    count = 0
    for _ in range(200):
        edge = None
        for f in bm.faces:
            codes = [p[part] for p in f.verts]
            if (sum(c in loops for c in codes) != 2 or not any(c in tubes for c in codes)
                    or min(math.degrees(c.calc_angle()) for c in f.loops) >= CUT_ANGLE):
                continue
            short = min(f.edges, key=lambda e: e.calc_length())
            if all(p[part] in loops for p in short.verts):
                edge = short
                break
        if edge is None:
            break
        bmesh.ops.collapse(bm, edges=[edge], uvs=True)
        count += 1
    return count


def build_tube(bm, source, fr, line, side, part, spoke):
    """Models the quad tube of one arm: one ring of `RING_VERTS` vertices at each station.

    Each ring stands at a right angle to its bone. Its center is the center of the cross section
    of the source arm, and its radius is the mean radius of that section.
    """
    src = bmesh.new()
    src.from_mesh(source.data)
    rings = []
    for point, axis in arm_stations(fr, line):
        _, pts = ring_faces(src, fr, line, side, point, axis)
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


def retopo_cut_and_tube(mesh, fr, joints):
    """Keeps a hidden copy of the source mesh, cuts both arms, collapses the thin faces at the
    wrist cut loops, and models both tubes."""
    source = mesh.copy()
    source.data = mesh.data.copy()
    source.name = source.data.name = 'polar-bear-source'
    bpy.context.scene.collection.objects.link(source)
    source.hide_render = True
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(mesh.data)
    part = bm.verts.layers.int.get('arm_part') or bm.verts.layers.int.new('arm_part')
    spoke = bm.verts.layers.int.get('arm_spoke') or bm.verts.layers.int.new('arm_spoke')
    out = {}
    for side in (1, -1):
        line = arm_line(fr, joints, side)
        removed = cut_arm(bm, fr, line, side, part)
        collapsed = clean_wrist_cut(bm, part, side)
        rings = build_tube(bm, source, fr, line, side, part, spoke)
        out[side] = (removed, collapsed, len(rings))
    bmesh.update_edit_mesh(mesh.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    source.hide_set(True)
    return source, out


def retopo_wrap(mesh, source):
    """Puts the tube vertices on the surface of the source arm with a Shrinkwrap modifier.

    The modifier projects each vertex along its normal, in both directions, onto the source copy.
    The tube normals point out from the arm line, so each ring keeps its plane.
    """
    group = part_group(mesh, 'retopo', (PART['tube'], PART['tube'] + 10))
    mod = mesh.modifiers.new('wrap', 'SHRINKWRAP')
    mod.target = source
    mod.wrap_method = 'PROJECT'
    mod.use_project_x = mod.use_project_y = mod.use_project_z = False
    mod.use_negative_direction = True
    mod.use_positive_direction = True
    mod.cull_face = 'OFF'
    mod.vertex_group = group.name
    apply_modifier(mesh, mod)
    mesh.vertex_groups.remove(mesh.vertex_groups['retopo'])


def retopo_bridge(mesh):
    """Joins each tube to the trunk and to the paw with Bridge Edge Loops.

    The first ring bridges to the cut loop of the shoulder line, and the last ring to the cut loop
    of the paw. The loops have more vertices than the rings, so the bridge makes triangles. The
    thin triangles of each wrist bridge then collapse (`clean_wrist_bridge()`), and the band of
    each wrist is smoothed (`smooth_wrists()`). Gives the number of the bridge faces, of the
    collapsed edges, and of the smoothed vertices.
    """
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(mesh.data)
    part = bm.verts.layers.int['arm_part']
    made = 0
    for off in (0, 10):
        tube = PART['tube'] + off
        ring_edges = [e for e in bm.edges if e.is_boundary and all(p[part] == tube for p in e.verts)]
        for code in ('shoulder', 'wrist'):
            loop = [e for e in bm.edges if e.is_boundary
                    and all(p[part] == PART[code] + off for p in e.verts)]
            near = {p for e in loop for p in e.verts}
            center = sum((p.co for p in near), Vector()) / len(near)
            # The ring of the tube end nearest to this cut loop.
            ends = {}
            for e in ring_edges:
                for p in e.verts:
                    ends[p] = (p.co - center).length
            limit = min(ends.values()) + 0.03
            ring = [e for e in ring_edges if all(ends[p] < limit for p in e.verts)]
            res = bmesh.ops.bridge_loops(bm, edges=loop + ring)
            for f in res['faces']:
                f.smooth = True
            made += len(res['faces'])
    collapsed = clean_wrist_bridge(bm, part)
    smoothed = smooth_wrists(bm, part)
    bmesh.update_edit_mesh(mesh.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    return made, collapsed, smoothed


#: The rounds and the factor of Smooth Vertices of `smooth_wrists()`, as on the bear
#: (`WRIST_SMOOTH` of `bear_arms.py`).
WRIST_SMOOTH = (4, 0.5)


def wrist_band(bm, part):
    """Gives the vertices of the band of both wrists: the cut loop of each paw, and the last ring
    of each tube, whose vertices join the loop by an edge."""
    loops = {PART['wrist'], PART['wrist'] + 10}
    tubes = {PART['tube'], PART['tube'] + 10}
    return [p for p in bm.verts if p[part] in loops or (
        p[part] in tubes and any(e.other_vert(p)[part] in loops for e in p.link_edges))]


def smooth_wrists(bm, part):
    """Smooths the band of each wrist (Smooth Vertices, `WRIST_SMOOTH`): the last ring of the tube
    and the cut loop of the paw, after the clean of the bridge.

    The ring is round, and the cut loop has the form of the paw, so the bridge between them keeps
    small steps and sharp corners. The smooth moves only the vertices of the two loops. Gives the
    number of the smoothed vertices.
    """
    verts = wrist_band(bm, part)
    rounds, factor = WRIST_SMOOTH
    for _ in range(rounds):
        bmesh.ops.smooth_vert(bm, verts=verts, factor=factor, use_axis_x=True, use_axis_y=True,
                              use_axis_z=True)
    return len(verts)


def retopo_snap_wrists(mesh, source):
    """Puts the smoothed band of each wrist back on the surface of the source arm (Shrinkwrap,
    Nearest Surface Point), after `smooth_wrists()`.

    The smooth pulls each vertex of the band toward the middle of its neighbors, so the wrist
    loses about 4 mm of its radius, and the outline of the paw shows a waist at rest. The snap
    keeps the spacing of the smooth along the surface and gives the band the form of the source
    mesh. Gives the number of the snapped vertices.
    """
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(mesh.data)
    bm.verts.index_update()
    ids = [p.index for p in wrist_band(bm, bm.verts.layers.int['arm_part'])]
    bpy.ops.object.mode_set(mode='OBJECT')
    group = mesh.vertex_groups.new(name='wrist-band')
    group.add(ids, 1.0, 'REPLACE')
    mod = mesh.modifiers.new('snap', 'SHRINKWRAP')
    mod.target = source
    mod.wrap_method = 'NEAREST_SURFACEPOINT'
    mod.vertex_group = group.name
    apply_modifier(mesh, mod)
    mesh.vertex_groups.remove(mesh.vertex_groups['wrist-band'])
    return len(ids)


# The UV seam of each tube runs along this spoke: the lower side of the arm in the T-pose.
SEAM_SPOKE = RING_VERTS // 2

# The size of the image of the arm faces in pixels. The bake writes the fur color of the source
# arms into it, and `atlas_strip()` puts it in a strip below the atlas of the source.
ARM_TEXTURE = 1024


def arm_faces(bm, part):
    """Gives the new faces of the arms: the tube faces and the bridge faces."""
    return [f for f in bm.faces if all(p[part] > 0 for p in f.verts)
            and any(p[part] in (PART['tube'], PART['tube'] + 10) for p in f.verts)]


def retopo_uv(mesh):
    """Gives the new arm faces their own material, a seam on each tube, and a new UV layout.

    The atlas of the source has many UV islands on each arm, so a UV transfer would cross island
    borders. The new faces get the material `polar-bear-arms`, Mark Seam along `SEAM_SPOKE` and one
    bridge edge at each end, Unwrap, and Pack Islands. `retopo_bake()` then fills its image.
    """
    mat = bpy.data.materials.get('polar-bear-arms') or bpy.data.materials.new('polar-bear-arms')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    image = bpy.data.images.get('polar-bear-arms') or bpy.data.images.new(
        'polar-bear-arms', ARM_TEXTURE, ARM_TEXTURE)
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


def retopo_bake(mesh, source):
    """Bakes the fur color of the source arms onto the image of the new arm faces.

    A copy of the mesh keeps only the new arm faces, so the bake writes only the image of
    `polar-bear-arms`. Cycles bakes the Diffuse Color from the source copy (Selected to Active).
    """
    scene = bpy.context.scene
    engine = scene.render.engine
    bpy.ops.object.select_all(action='DESELECT')
    target = mesh.copy()
    target.data = mesh.data.copy()
    target.name = 'polar-bear-arm-bake'
    scene.collection.objects.link(target)
    bm = bmesh.new()
    bm.from_mesh(target.data)
    part = bm.verts.layers.int['arm_part']
    keep = set(arm_faces(bm, part))
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f not in keep], context='FACES')
    bm.to_mesh(target.data)
    bm.free()
    target.data.materials.clear()
    target.data.materials.append(bpy.data.materials['polar-bear-arms'])
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
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, use_selected_to_active=True,
                        cage_extrusion=0.02, max_ray_distance=0.06, margin=8)
    scene.render.engine = engine
    bpy.data.objects.remove(target, do_unlink=True)
    source.hide_render = True
    source.hide_set(True)
    image = bpy.data.images['polar-bear-arms']
    image.pack()
    return image


def retopo_normals(mesh, source):
    """Gives the new arm faces and the cut loops the custom normals of the source surface.

    A Data Transfer modifier copies the face corner normals of the nearest source face
    (interpolated) onto the vertices of the tubes, the bridges, and the cut loops. The seams then
    have the same normal on both sides.
    """
    group = part_group(mesh, 'retopo', [c + off for c in PART.values() for off in (0, 10)])
    mod = mesh.modifiers.new('normals', 'DATA_TRANSFER')
    mod.object = source
    mod.use_loop_data = True
    mod.data_types_loops = {'CUSTOM_NORMAL'}
    mod.loop_mapping = 'POLYINTERP_NEAREST'
    mod.vertex_group = group.name
    apply_modifier(mesh, mod)
    mesh.vertex_groups.remove(mesh.vertex_groups['retopo'])


def atlas_strip(mesh):
    """Puts the arm image in a strip on top of the atlas of the source, so that the mesh keeps one
    material and one image (`pnpm rig-mesh` reads one base color texture).

    The new image is the width of the atlas and `ARM_TEXTURE` pixels higher. The atlas keeps its
    pixels in the rows from 0, and the arm image goes into the strip at the left. The UVs of each
    face move to the place of its pixels, and the arm faces take the material of the source.
    """
    import numpy as np

    fur = mesh.data.materials[0]
    bsdf = next(n for n in fur.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    atlas = bsdf.inputs['Base Color'].links[0].from_node.image
    arms = bpy.data.images['polar-bear-arms']
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
    image = bpy.data.images.new('polar-bear-fur', width, height + size)
    image.colorspace_settings.name = atlas.colorspace_settings.name
    image.pixels.foreach_set(pixels.ravel())
    image.pack()
    total = height + size
    arm_index = list(mesh.data.materials).index(bpy.data.materials['polar-bear-arms'])
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
    return image


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


def retopo_arms(mesh, fr, joints):
    """Replaces the faces of both arms with quad tubes, as a modeller does by hand.

    The steps: cut and model the tubes, Shrinkwrap, Bridge Edge Loops with the clean and the smooth
    of the wrists, the snap of the wrists, a new UV layout with its own material, a bake of the fur
    color, a transfer of the custom normals, and the strip of the arm image in the atlas. The
    source copy then goes. Gives the counts of the steps.
    """
    source, out = retopo_cut_and_tube(mesh, fr, joints)
    source.hide_set(False)
    retopo_wrap(mesh, source)
    out['bridge'] = retopo_bridge(mesh)
    out['snapped'] = retopo_snap_wrists(mesh, source)
    retopo_uv(mesh)
    retopo_bake(mesh, source)
    source.hide_set(False)
    retopo_normals(mesh, source)
    bpy.data.objects.remove(source, do_unlink=True)
    prepare_material(mesh)
    atlas_strip(mesh)
    bpy.context.view_layer.objects.active = mesh
    return out


def export_source(mesh, path):
    """Writes the mesh with the new arms as the source of the rig: one mesh, one material with the
    base color image, no skin. The image is a JPEG at the quality 92."""
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=False,
        export_skins=False, export_morph=False, export_animations=False,
        export_image_format='JPEG', export_jpeg_quality=92, export_extras=False,
        export_attributes=False)
    return os.path.getsize(path)


def rig_mesh():
    """Loads the functions of `rig_mesh.py` with no run of its main step."""
    path = os.path.join(ROOT, 'tools', 'blender', 'rig_mesh.py')
    with open(path) as f:
        source = f.read().rstrip()
    source = source[: -len('main()')]
    names = {'__name__': 'rig_mesh_lib', '__file__': path}
    exec(compile(source, path, 'exec'), names)
    return names


#: The bones that move no vertex in this rig: the root, and the arm bones whose segments and
#: helpers take their vertices. The pose code of the app turns them, and they drive the segments.
DRIVERS = ('root',) + tuple(f'{b}_{s}' for s in 'LR'
                            for b in ('upper_arm', 'forearm', 'forearm_twist'))


def add_skeleton(fr, config):
    """Adds the studio skeleton with the arm segments and the helpers (`armSegments` of the
    config) at the joints of the config. Each helper spans its joint for the bind: its middle is on
    the joint, so that the bone heat gives it the rings of the joint."""
    rm = rig_mesh()
    heads, ends, rolls, children = rm['joints_of'](config)
    rm['segment_joints'](heads, ends, rolls, children, config['armSegments'])
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


def bind(mesh, rig):
    """Parents the mesh to the rig with automatic weights, then Limit Total 4 and Normalize All."""
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    paint_mode(mesh)
    limit_and_normalize()
    bpy.ops.object.mode_set(mode='OBJECT')


def write_weights(mesh, rig, fr, path):
    """Writes the weights for `paintedWeights` of the config: the deform bones, the place of each
    vertex in the units of the studio, and its weights."""
    rm = rig_mesh()
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
    data = {'note': 'Weights of the polar bear with the rebuilt arms, painted in Blender on '
                    '2026-10-24 (tools/blender/polar_bear_arms.py): automatic weights and Weight '
                    'Paint fixes. Points in the units of the studio.',
            'bones': bones, 'points': points, 'weights': rows}
    with open(path, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    return len(rows)


def drive_in_blender(rig, config):
    """Adds Copy Rotation constraints that turn the segments and the helpers in Blender about as
    the app turns them, for the test poses of the weight fixes. Each forearm segment copies its
    share of the twist of the paw (the Y axis, in local space), and each helper copies half of the
    turn of the bone after its joint (world space), as on the Rigify rabbit. The app ignores the
    constraints: `poseArm()` of `src/models/studio-rig.ts` turns the bones."""
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


def test_pose(rig, down=70.0, forward=30.0, elbow=100.0, twist=90.0):
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


def paint_weights(mesh, fr):
    """Paints the fixes of the session with the Weight Paint tools, in the order of the session.
    The places are in the units of the studio (`Frame`).

    1. Trunk under the armpits: the automatic weights gave the side of the trunk below the arm
       root up to 0.2 of the upper arm segments, and the long faces there showed as slits on the
       side of the trunk in the play. Remove From Group of the arm bones inside |x| 0.14, from y
       0.45 to 0.8.
    2. Shoulder line: Smooth on the band of the arm root (|x| 0.1 to 0.2, y 0.5 to 0.82), so that
       the weights of the long faces of the armpit change gradually.
    3. Arms: Smooth on the vertices that hang at least 0.6 on the arm bones, so that the turn
       changes gradually from one segment to the next.
    """
    def place(p):
        return (abs(p.co.x) / fr.height, (p.co.z - fr.floor) / fr.height)

    arms = arm_groups()
    paint_mode(mesh, lambda p: place(p)[0] < 0.14 and 0.45 < place(p)[1] < 0.8)
    remove_from(mesh, arms)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='BONE_DEFORM', lock_active=False)
    paint_mode(mesh, lambda p: 0.1 < place(p)[0] < 0.2 and 0.5 < place(p)[1] < 0.82)
    bpy.ops.object.vertex_group_smooth(group_select_mode='BONE_DEFORM', factor=0.5, repeat=6)
    limit_and_normalize()
    bpy.ops.object.mode_set(mode='OBJECT')
    names = {g.index: g.name for g in mesh.vertex_groups}
    arm_set = set(arms) | {f'hand_{s}' for s in 'LR'}
    paint_mode(mesh, lambda p: sum(g.weight for g in p.groups if names[g.group] in arm_set) > 0.6)
    bpy.ops.object.vertex_group_smooth(group_select_mode='BONE_DEFORM', factor=0.5, repeat=4)
    limit_and_normalize()
    bpy.ops.object.mode_set(mode='OBJECT')
    mesh.data.use_paint_mask_vertex = False


def main():
    """Runs the steps of the session and writes the source mesh and the weights into the out dir
    (`assets/models/polar-bear/` by default)."""
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out_dir = os.path.abspath(argv[0]) if argv else os.path.join(ROOT, 'assets', 'models',
                                                                  'polar-bear')
    config = load_config()
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    mesh = import_mesh()
    fr = Frame(mesh)
    out = retopo_arms(mesh, fr, config['joints'])
    print('polar_bear_arms: %s' % json.dumps({str(k): v for k, v in out.items()}))
    size = export_source(mesh, os.path.join(out_dir, 'polar-bear-arms.glb'))
    rig = add_skeleton(fr, config)
    bind(mesh, rig)
    paint_weights(mesh, fr)
    count = write_weights(mesh, rig, fr, os.path.join(out_dir, 'polar-bear-weights.json'))
    print('polar_bear_arms: wrote polar-bear-arms.glb (%d bytes) and the weights of %d vertices '
          'into %s' % (size, count, out_dir))


if __name__ == '__main__':
    main()
