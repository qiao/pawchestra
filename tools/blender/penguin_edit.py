"""Frees the flippers of a copy of the penguin mesh from the trunk (design 4.4, "Source meshes").

The inner side of each flipper of `penguin-edge.glb` joins the side of the trunk from the shoulder
down to about 0.85 of the upper arm, in a deep crease. `arm_rebuild.py` then finds no free section
of the upper arm. This script frees each flipper in a copy, `penguin-free.glb`, with the steps of
`beaver_edit.py` and the values of the penguin below, so that `arm_rebuild.py` starts the tube
near the shoulder joint:

1. Import the copy with the color edge cut (`penguin_edge.py`) and Merge by Distance
   (`violin_arms.import_mesh()`).
2. Give the trunk alone the vertex where the left flipper touches the trunk (`KISSES`,
   `step_unkiss()`). Remove the flap faces at the bottom of each crease (`FLAPS`), which hold
   the only open edges and the edges of more than two faces, and split the edges of the crease
   where the flipper meets the trunk (`SEAMS`, `beaver_edit.step_rip()`).
3. Turn the flipper out about the forward axis through the shoulder joint, and shift it out and
   up, with a ramp along the upper arm (`beaver_edit.step_turn()`).
4. Close the flipper and the trunk, smooth the pockets and the old crease, and round the inner
   side of the flipper (`beaver_edit.step_fill()` to `step_round()`).
5. Cut the side wall along the line where the white side meets the black back
   (`step_wall_edge()`), give the new faces the colors beside them (`step_color()`), and write
   the copy.

The beak split and the color edge cut of the earlier copies stay. The script prints the joints of
the left arm of the rig config after the turn (`beaver_edit.turned_joints()`). `SOURCE_ARM` keeps
the joints of the mesh before the edit.

Run it in a terminal from the root of the tree:

    blender -b --factory-startup -P tools/blender/penguin_edit.py -- <out.glb>

Two runs give the same bytes: the script runs Blender again with `PYTHONHASHSEED=0`, as
`beaver_edit.py` does.
"""

import json
import os
import subprocess
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import beaver_edit as be  # noqa: E402

ar, va = be.ar, be.va

#: The mesh before the edit: the copy with the split beak and the color edge cut.
SOURCE = 'assets/models/penguin/penguin-edge.glb'

#: The seam of each flipper: the chain of concave edges where the flipper meets the trunk, from
#: the back of the shoulder, down the back crease, through the bottom of the crease, and up the
#: front crease. It is the shortest edge path that prefers the concave edges (an edge costs 0.3 of
#: its length when its faces turn more than 12° inward, and 3 times its length else). Each end
#: lies between -0.08 and 0.03 of the upper arm from the shoulder joint, before the start of the
#: flood (`FLOOD`), and the next vertex lies after it. Thus each split vertex moves with the
#: flipper, and the hole has no slit of two copies at one point above the armpit line. The mesh
#: is not symmetric, so each side has its own path. Vertex indices of the welded copy
#: (`violin_arms.import_mesh()`).
SEAMS = {
    1: [416, 458, 462, 465, 466, 467, 443, 436, 437, 438, 442, 711, 710, 440, 439, 433, 432, 431,
        430, 429, 398, 397, 396, 395],
    -1: [575, 614, 613, 611, 612, 609, 597, 592, 590, 589, 587, 586, 584, 595, 596, 601, 545, 602,
         603, 550, 556, 553],
}

#: The flap faces at the bottom of each crease: the face of the left crease whose edge 442-711 has
#: three faces and whose two other edges are open, and the four faces of a small closed
#: tetrahedron on the edge 584-586 of the right crease.
FLAPS = ((442, 711, 713), (584, 586, 593), (593, 586, 594), (593, 594, 584), (594, 586, 584))

#: The places where the inner side of a flipper touches the trunk at one vertex inside both
#: surfaces: the faces of the flipper around the vertex, and the one face that replaces them
#: (`step_unkiss()`). The edge 711-712 of the left crease has two faces of the flipper and two
#: faces of the trunk.
KISSES = ((((714, 711, 712), (714, 712, 691), (691, 712, 711)), (714, 711, 691)),)

#: The turn of each flipper out from the trunk, in degrees, and its shift out and up, in units.
TURN = 8.0
SHIFT = 0.012

#: The shares of the upper arm over which the turn grows from 0 to its full angle, and the share
#: of the upper arm from which the flood of the flipper starts (`beaver_edit.arm_region()`).
RAMP = (0.05, 0.4)
FLOOD = 0.05

#: The two copies of a seam vertex do not join again (`beaver_edit.JOIN`).
JOIN = 0.0

#: The side wall of the trunk (`beaver_edit.step_wall()`): the values of the beaver, but no trunk
#: face beside the hole goes (`lip` -1). Each removal of the faces that turn away from the
#: flipper opened the trunk at the front end of the seam, so that the hole touched itself.
WALL = dict(be.WALL, lip=-1.0)

#: The joints of the left arm of the mesh before the edit, in the units of the studio. The rig
#: config holds the joints of the turned flippers.
SOURCE_ARM = {
    'upper_arm_L': {'head': [0.19, 0.6, 0.01]},
    'forearm_L': {'head': [0.245, 0.49, 0.012]},
    'forearm_twist_L': {'head': [0.2625, 0.455, 0.015]},
    'hand_L': {'head': [0.28, 0.42, 0.018]},
    'fingers_L': {'head': [0.298, 0.37, 0.025], 'tail': [0.312, 0.3, 0.03]},
}


def session():
    """Gives a session of `arm_rebuild.py` on the penguin copy with the color edge cut, with the
    arm joints of that copy (`SOURCE_ARM`)."""
    s = ar.Session('penguin', source=SOURCE)
    for name, joint in SOURCE_ARM.items():
        s.joints[name] = dict(s.joints[name], **joint)
    return s


def step_unkiss(s):
    """Replaces the faces of the flipper around each vertex of `KISSES` with one face, so that the
    vertex lies only in the trunk. Each corner of the new face keeps its UV in the old faces.
    Gives the count of the new faces."""
    bm = bmesh.new()
    bm.from_mesh(s.mesh.data)
    bm.verts.ensure_lookup_table()
    uv = bm.loops.layers.uv.active
    count = 0
    for olds, new in KISSES:
        faces = [bm.faces.get([bm.verts[i] for i in face]) for face in olds]
        if any(f is None for f in faces):
            raise RuntimeError('A face of KISSES is no face of the mesh.')
        at = {lp.vert.index: lp[uv].uv.copy() for f in faces for lp in f.loops}
        smooth = faces[0].smooth
        material = faces[0].material_index
        # The edges that only these faces hold go too, so that no wire edge joins the vertex to
        # the flipper.
        bmesh.ops.delete(bm, geom=faces, context='FACES')
        face = bm.faces.new([bm.verts[i] for i in new])
        face.smooth, face.material_index = smooth, material
        for lp in face.loops:
            lp[uv].uv = at[lp.vert.index]
        count += 1
    bm.to_mesh(s.mesh.data)
    bm.free()
    return count


def step_color(s):
    """Gives the new faces their colors, in place of `beaver_edit.step_color()`. The new faces of
    each flipper take one color: the UV middle of the old face beside them whose texture color is
    nearest to the median color of these old faces, as on the beaver. Each face of the side wall
    below `WALL_EDGE` and forward of the plane of `FLANK_LINE` takes the UV middle of the nearest
    light old face, and each other face of the wall the color of the flipper of its side. The old
    faces keep their colors, so that the black and white edge of the trunk stays where
    `penguin_edge.py` cut it. Gives the count of the faces of the walls and the median colors of
    the flippers."""
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

    out = {}
    flipper = {}
    for side in (1, -1):
        new = [f for f in bm.faces if f[fill] == be.ARM_FILL and f.calc_center_median().x * side > 0]
        region = {p for f in new for p in f.verts}
        beside = [g for p in region for g in p.link_faces
                  if not g[fill] and all(q[part] in (be.ARM_LIP, be.ARM, be.APEX) for q in g.verts)]
        beside = list(dict.fromkeys(beside))
        colors = np.array([color(middle(g)) for g in beside])
        median = np.median(colors, axis=0)
        flipper[side] = middle(beside[int(np.argmin(np.linalg.norm(colors - median, axis=1)))])
        for f in new:
            for lp in f.loops:
                lp[uv].uv = flipper[side]
        out[side] = [round(float(c), 3) for c in median]
    walls = [f for f in bm.faces if f[fill] == be.TRUNK_FILL]
    plane_co, plane_no = flank_plane(s)
    lights = [(f.calc_center_median(), middle(f)) for f in bm.faces
              if not f[fill] and color(middle(f)).mean() > 0.5]
    top = s.fr.point((0.0, WALL_EDGE if WALL_EDGE is not None else 0.0, 0.0)).z
    for f in walls:
        center = f.calc_center_median()
        if center.z < top and (center - plane_co).dot(plane_no) > 0:
            _, at = min(lights, key=lambda m: (m[0] - center).length)
        else:
            at = flipper[1 if center.x > 0 else -1]
        for lp in f.loops:
            lp[uv].uv = at
    out['wall'] = len(walls)
    bm.to_mesh(s.mesh.data)
    bm.free()
    return out


#: The line of the side view where the white side meets the black back, as (height, forward)
#: points in units: `colors.flank.line` of the rig config. `step_wall_edge()` cuts the faces of
#: the wall along the plane of this line below the height `WALL_EDGE`, and each wall face forward
#: of the plane takes the white of the nearest light old face of the trunk. Thus the edge under the
#: raised flipper is one straight line, and the other wall faces take the black of the flipper.
#: With no cut, the flank rule of the rig made the wall faces white one by one, with a saw-tooth
#: edge.
FLANK_LINE = ((0.62, 0.06), (0.26, -0.06))
WALL_EDGE = 0.55


def flank_plane(s):
    """Gives the plane of `FLANK_LINE` in Blender: a point, and the unit normal toward the front."""
    (y0, z0), (y1, z1) = FLANK_LINE
    a, b = s.fr.point((0.0, y0, z0)), s.fr.point((0.0, y1, z1))
    normal = (b - a).cross(Vector((1.0, 0.0, 0.0))).normalized()
    if normal.y > 0:
        # The studio forward (+z) is -y in Blender.
        normal = -normal
    return a, normal


def step_wall_edge(s):
    """Cuts the faces of each side wall along the plane of `FLANK_LINE` below the height
    `WALL_EDGE`, so that the edge of the white side goes on over the wall as one straight line
    (`step_color()`). Gives the count of the cut faces, or None with no `WALL_EDGE`."""
    if WALL_EDGE is None:
        return None
    bm = bmesh.new()
    bm.from_mesh(s.mesh.data)
    fill = bm.faces.layers.int['edit_fill']
    top = s.fr.point((0.0, WALL_EDGE, 0.0)).z
    faces = [f for f in bm.faces if f[fill] == be.TRUNK_FILL and f.calc_center_median().z < top]
    co, no = flank_plane(s)
    geom = list({x for f in faces for x in list(f.verts) + list(f.edges)}) + faces
    cut = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no)
    bm.to_mesh(s.mesh.data)
    bm.free()
    return len(cut['geom_cut'])


#: The steps after `step_unkiss()`: the steps of `beaver_edit.py` with the colors of the penguin.
STEPS = be.STEPS[:-1] + (step_wall_edge, step_color)


def use_penguin():
    """Puts the values of the penguin into `beaver_edit.py`, whose steps read them."""
    be.SEAMS, be.FLAPS, be.TURN, be.SHIFT = SEAMS, FLAPS, TURN, SHIFT
    be.RAMP, be.FLOOD, be.JOIN, be.WALL = RAMP, FLOOD, JOIN, WALL


def main():
    """Runs the steps on the mesh, writes the copy, and prints the joints of the left arm for the
    rig config."""
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if len(argv) != 1:
        raise SystemExit('Usage: blender -b --factory-startup -P tools/blender/penguin_edit.py -- '
                         '<out.glb>')
    if sys.flags.hash_randomization:
        # A fixed string hash gives the same order of each set and dict on each run.
        env = dict(os.environ, PYTHONHASHSEED='0')
        code = subprocess.call([bpy.app.binary_path, '-b', '--factory-startup',
                                '--python-use-system-env', '--python', os.path.abspath(__file__),
                                '--', *argv], env=env)
        raise SystemExit(code)
    use_penguin()
    va.clear_scene()
    s = session()
    va.import_mesh(s)
    for step in (step_unkiss,) + STEPS:
        print('penguin_edit: %s: %s' % (step.__name__, step(s)))
    size = be.step_export(s, os.path.abspath(argv[0]))
    print('penguin_edit: wrote %s, %d bytes' % (argv[0], size))
    joints = be.turned_joints(s.joints, 1.0)
    print('penguin_edit: joints %s' % json.dumps({'%s.%s' % k: v for k, v in joints.items()}))


if __name__ == '__main__':
    main()
