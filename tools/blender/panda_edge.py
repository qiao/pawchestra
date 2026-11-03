# Output: `assets/models/panda/panda-edge.glb`, from `panda-arms.glb`.
"""Cuts the faces of the panda along the edges of its eye patches and of its black band, so that
each face of the rig lies on one side of an edge. Each face takes one color in the rig, and the
faces of the head and the trunk are 2 cm to 5 cm across, so with no cut each patch is a set of
angular shards and the lower edge of the band is a saw line. The texture has a smooth oval around
each eye and a smooth curve at the band.

    /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
        --python tools/blender/panda_edge.py -- <in.glb> <out.glb> [levels] [limit]

The steps:

1. Import the file, and weld the vertices at 1e-5 units of the file, as `pnpm rig-mesh` does.
2. Give each vertex a side: light when the Oklab lightness of the base color texture at the UV of
   its first face corner is at least `LIGHTNESS`.
3. Split the faces of the regions (`REGIONS`) that the edge crosses, `levels` times (1 by
   default): each face with light and dark texture samples, or with corners of two sides, splits
   each edge at its middle, and each face then splits along the lines between its new vertices.
4. On each edge of the regions whose two vertices have different sides, find the place of the
   change, as `penguin_edge.py` does: the texture is sampled at 64 steps along the edge, and the
   place is the change nearest to the middle, from `limit` to 1 - `limit` of the edge (0.15 by
   default). A vertex nearer to the change than `limit` of the edge lies on the line: its edges
   are not cut, so that no new face is a thin sliver. Split each other edge there, and split each
   face along the line between its new vertices, or from its one new vertex to the opposite corner.
5. Triangulate the faces with more than three corners, and export the GLB file.

Each new vertex lies on an old edge or on a line across an old face, so the surface does not move.
The steps skip the edges of the faces in the eye boxes (`colors.eyeBox` of the config, with
`EYE_MARGIN`), so that the old eyes of the rig keep their faces. The rig takes the weights of the
mesh before the cut (`weightSource` of the config).
"""
import json
import os
import sys

import bmesh
import bpy
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:]
SOURCE, OUT = argv[:2]
LEVELS = int(argv[2]) if len(argv) > 2 else 1
LIMIT = float(argv[3]) if len(argv) > 3 else 0.15

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CONFIG = os.path.join(ROOT, 'tools', 'mesh-rigs', 'panda.json')

#: The Oklab lightness that divides the black fur (about 0.2) from the white fur (about 0.85).
LIGHTNESS = 0.5

#: The samples along an edge.
STEPS = 64

#: The texture samples of a face in step 3: the points of a grid of this many steps on each edge.
GRID = 6

#: The regions of the cut, in the units of the studio with x as |x|: the eye patches, in front of
#: the eyes and behind the nose, and the lower edge of the band on the back. The front and the
#: sides of the band and the shoulders keep their faces: there the weights of the clavicles change
#: much from corner to corner, so the skin moves a new vertex off the line of its old edge, and
#: the small new faces turn over in the play (`pnpm fold-probe trombonist`).
REGIONS = [
    [[0.03, 0.76, 0.09], [0.15, 0.905, 0.175]],
    [[0.0, 0.44, -1.0], [0.12, 0.62, -0.04]],
]

#: The margin around each eye box, in units.
EYE_MARGIN = 0.008


def linear(srgb):
    """Converts sRGB values from 0 to 1 to linear values."""
    return np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)


def lightness(srgb):
    """Gives the Oklab lightness of sRGB colors (Björn Ottosson, 2020)."""
    rgb = linear(np.asarray(srgb, float))
    lms = rgb @ np.array([[0.4122214708, 0.5363325363, 0.0514459929],
                          [0.2119034982, 0.6806995451, 0.1073969566],
                          [0.0883024619, 0.2817188376, 0.6299787005]]).T
    return np.cbrt(lms) @ np.array([0.2104542553, 0.7936177850, -0.0040720468])


with open(CONFIG) as f:
    config = json.load(f)
for old in list(bpy.data.objects):
    bpy.data.objects.remove(old)
bpy.ops.import_scene.gltf(filepath=SOURCE)
ob = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
mesh = ob.data
node = next(n for n in mesh.materials[0].node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
image = node.inputs['Base Color'].links[0].from_node.image
width, height = image.size
pixels = np.empty(width * height * 4, np.float32)
image.pixels.foreach_get(pixels)
texture = pixels.reshape(height, width, 4)[:, :, :3]


def light_at(uv):
    """Gives True where the texture at each UV is light."""
    uv = np.atleast_2d(uv)
    x = np.clip(((uv[:, 0] % 1.0) * width).astype(int), 0, width - 1)
    y = np.clip(((uv[:, 1] % 1.0) * height).astype(int), 0, height - 1)
    return lightness(texture[y, x]) >= LIGHTNESS


bm = bmesh.new()
bm.from_mesh(mesh)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
uv_layer = bm.loops.layers.uv.active
faces_before = len(bm.faces)


def thin_faces():
    """Counts the faces with a corner angle below 10 degrees, the limit of the sliver rule."""
    count = 0
    for face in bm.faces:
        if any(loop.calc_angle() < np.radians(10.0) for loop in face.loops):
            count += 1
    return count


thin_before = thin_faces()

# The studio units of `load_mesh()` of `rig_mesh.py`: the axes of the studio, 1 unit high, the
# soles at y = 0. The cut does not move the lowest and the highest vertex.
world = ob.matrix_world
places = np.array([(world @ v.co)[:] for v in bm.verts])
places = np.stack([places[:, 0], places[:, 2], -places[:, 1]], axis=1)
floor, top = places[:, 1].min(), places[:, 1].max()


def studio(vert):
    """Gives the place of a vertex in the units of the studio."""
    p = world @ vert.co
    return (np.array([p[0], p[2], -p[1]]) - [0.0, floor, 0.0]) / (top - floor)


def in_regions(p):
    """Tells if a point in the units of the studio is in a region of the cut."""
    q = np.array([abs(p[0]), p[1], p[2]])
    return any(np.all(q >= lo) and np.all(q <= hi) for lo, hi in np.asarray(REGIONS, float))


# The faces in an eye box keep their edges.
bm.faces.ensure_lookup_table()
middles = np.array([np.mean([studio(v) for v in f.verts], axis=0) for f in bm.faces])
lo, hi = np.asarray(config['colors']['eyeBox'], float)
side_x = np.abs(middles[:, 0])
eye = ((side_x >= lo[0] - EYE_MARGIN) & (side_x <= hi[0] + EYE_MARGIN)
       & (middles[:, 1] >= lo[1] - EYE_MARGIN) & (middles[:, 1] <= hi[1] + EYE_MARGIN)
       & (middles[:, 2] >= lo[2] - EYE_MARGIN) & (middles[:, 2] <= hi[2] + EYE_MARGIN))
kept_faces = [int(f) for f in np.nonzero(eye)[0]]
frozen = bm.edges.layers.int.new('frozen')
for f in kept_faces:
    for e in bm.faces[f].edges:
        e[frozen] = 1
print(f'edge_cut: {len(kept_faces)} faces of the eye boxes keep their edges')


def is_frozen(edge):
    """Tells if an edge belongs to a kept face."""
    return edge[frozen] == 1


def vert_light(v):
    """Gives the side of a vertex by the texture at the UV of its first face corner."""
    return bool(light_at(v.link_loops[0][uv_layer].uv)[0])


def split_edges(edges_and_places):
    """Splits each edge at its place (a share from the start vertex), and splits each face along
    the lines between its new vertices. A face with one new vertex splits to its opposite corner.
    Gives the new vertices."""
    new = []
    for edge, start, place in edges_and_places:
        new.append(bmesh.utils.edge_split(edge, start, place)[1])
    new_ids = {id(v) for v in new}
    for face in list({id(f): f for v in new for f in v.link_faces}.values()):
        ends = [loop.vert for loop in face.loops if id(loop.vert) in new_ids]
        if len(ends) == 1:
            corner = next(loop.link_loop_next.link_loop_next.vert for loop in face.loops
                          if loop.vert is ends[0])
            bmesh.utils.face_split(face, ends[0], corner)
            continue
        # Two new vertices give one line, and three (one on each edge of a triangle) give the
        # four triangles of the middles.
        pieces = [face]
        pairs = [(ends[0], ends[1])] if len(ends) == 2 else list(zip(ends, ends[1:] + ends[:1]))
        for a, b in pairs:
            piece = next(p for p in pieces if a in p.verts and b in p.verts)
            pieces.append(bmesh.utils.face_split(piece, a, b)[0])
    long = [f for f in bm.faces if len(f.verts) > 3]
    bmesh.ops.triangulate(bm, faces=long, quad_method='BEAUTY', ngon_method='BEAUTY')
    return new


grid = np.array([(i / GRID, j / GRID) for i in range(GRID + 1) for j in range(GRID + 1 - i)])
for level in range(LEVELS):
    light = {v: vert_light(v) for v in bm.verts if v.link_loops}
    chosen = []
    for face in bm.faces:
        if not in_regions(np.mean([studio(v) for v in face.verts], axis=0)):
            continue
        uv = np.array([loop[uv_layer].uv[:] for loop in face.loops])
        samples = uv[0] + grid[:, :1] * (uv[1] - uv[0]) + grid[:, 1:] * (uv[2] - uv[0])
        sides = light_at(samples)
        corners = {light.get(v, True) for v in face.verts}
        if sides.all() != sides.any() or len(corners) > 1:
            chosen.extend(e for e in face.edges if not is_frozen(e))
    edges = list({id(e): e for e in chosen}.values())
    split_edges([(e, e.verts[0], 0.5) for e in edges])
    print(f'edge_cut: split level {level + 1}: {len(edges)} edges split at the middle, '
          f'{len(bm.faces)} faces')

light = {v: vert_light(v) for v in bm.verts if v.link_loops}
places = []
for edge in bm.edges:
    a, b = edge.verts
    if (a not in light or b not in light or light[a] == light[b] or not edge.link_loops
            or is_frozen(edge) or not in_regions((studio(a) + studio(b)) / 2)):
        continue
    loop = edge.link_loops[0]
    uv0, uv1 = np.array(loop[uv_layer].uv), np.array(loop.link_loop_next[uv_layer].uv)
    t = np.linspace(0.0, 1.0, STEPS + 1)
    sides = light_at(uv0[None] + t[:, None] * (uv1 - uv0)[None])
    changes = np.nonzero(sides[1:] != sides[:-1])[0]
    place = 0.5 if len(changes) == 0 else float(
        (t[changes] + 0.5 / STEPS)[np.argmin(np.abs(t[changes] + 0.5 / STEPS - 0.5))])
    places.append((edge, loop.vert, place))
# A vertex less than `limit` of an edge from the change lies on the line: its edges are not cut,
# and the line goes through it, so that no new face is a thin sliver.
on_line = set()
for edge, start, place in places:
    if place < LIMIT:
        on_line.add(id(start))
    elif place > 1.0 - LIMIT:
        on_line.add(id(edge.other_vert(start)))
cuts = [(edge, start, place) for edge, start, place in places
        if id(edge.verts[0]) not in on_line and id(edge.verts[1]) not in on_line]
print(f'edge_cut: {len(on_line)} vertices lie on the line')
split_edges(cuts)
print(f'edge_cut: levels {LEVELS}, limit {LIMIT}: {len(cuts)} edges cut, {faces_before} faces '
      f'before and {len(bm.faces)} after, {thin_before} faces below 10 degrees before and '
      f'{thin_faces()} after')

bm.edges.layers.int.remove(frozen)
bm.to_mesh(mesh)
bm.free()
mesh.update()
check = bmesh.new()
check.from_mesh(mesh)
print('edge_cut:', {'open edges': sum(1 for e in check.edges if e.is_boundary),
                    'edges with more than two faces': sum(1 for e in check.edges
                                                          if len(e.link_faces) > 2),
                    'triangles': len(check.faces)})
check.free()
bpy.ops.object.select_all(action='DESELECT')
ob.select_set(True)
bpy.context.view_layer.objects.active = ob
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', use_selection=True, export_apply=False,
    export_skins=False, export_morph=False, export_animations=False,
    export_image_format='JPEG', export_jpeg_quality=92, export_extras=False,
    export_attributes=False)
print('edge_cut: wrote', OUT)
