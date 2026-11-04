# Output: `assets/models/pig/pig-root.glb` and `assets/models/pig/pig-root-weights.json`.
"""Moves the hidden root of each free arm of a copy of the pig mesh toward the trunk wall.

Each free arm of `pig-arms.glb` is a closed part with no face that joins it to the trunk
(`tools/blender/pig_arms.py`). The top ring of its tube and its dome lie around the shoulder
joint, so their inner side lies inside the trunk. The turns of the arm move this hidden root
deeper, and the sweep measures it as a clip of the upper arm in the body (design 9.3). The move
file `tools/arm-roots/pig-moves.json` gives the source place of each vertex to move and its move
in units. The script moves each of these arm vertices out along the line to the nearest point of
the trunk surface.

A vertex of the dome that goes deep into the trunk in one pose and comes out of the shoulder in
another pose cannot move toward the wall. Its depth swings with its distance from the shoulder
joint, so the list `shrinks` of the move file moves it, at its place after the moves, the share
`share` of the way to the shoulder joint of its side (`upper_arm_L` of the rig config, mirrored
for the right side). The other vertices, the faces, and the UV stay.

The weights file of the rig (`paintedWeights`) finds the weights of each vertex by its place, so
the script also writes a copy of `pig-weights.json` with the new place of each moved vertex. The
weights stay.

    blender -b --factory-startup --python tools/blender/pig_root.py -- [--moves <file>] \
        [--out <dir>]

The points are in the units and the axes of the rig config (`tools/mesh-rigs/pig.json`): 1 unit
from the soles to the top, the soles at y = 0, y up, +z forward, and +x the left side. A run gives
the same bytes.
"""
import hashlib
import json
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

#: The input files, the output names, and the weld of the rig config.
SOURCE = 'assets/models/pig/pig-arms.glb'
WEIGHTS = 'assets/models/pig/pig-weights.json'
MOVES = 'tools/arm-roots/pig-moves.json'
CONFIG = 'tools/mesh-rigs/pig.json'
OUT_GLB = 'pig-root.glb'
OUT_WEIGHTS = 'pig-root-weights.json'
WELD = 1e-5


def load(path):
    """Imports a GLB file of one mesh, welds and triangulates it in world space, as `load_mesh()`
    of `tools/blender/rig_mesh.py` does, and gives the object, its world matrix, the bmesh, the
    floor, and the scale to rig units."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if len(meshes) != 1:
        raise SystemExit(f'{path} has {len(meshes)} meshes, not 1.')
    ob = meshes[0]
    mw = ob.matrix_world.copy()
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.transform(mw)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=WELD)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    zs = [v.co.z for v in bm.verts]
    floor = min(zs)
    return ob, mw, bm, floor, 1.0 / (max(zs) - floor)


def islands(bm):
    """Gives the vertex indices of each connected part of the mesh, the largest part first."""
    seen, parts = set(), []
    for start in bm.verts:
        if start.index in seen:
            continue
        seen.add(start.index)
        stack, part = [start], []
        while stack:
            a = stack.pop()
            part.append(a.index)
            for e in a.link_edges:
                b = e.other_vert(a)
                if b.index not in seen:
                    seen.add(b.index)
                    stack.append(b)
        parts.append(part)
    return sorted(parts, key=len, reverse=True)


def inside(tree, point):
    """Tells if a point lies inside a closed part: an odd count of hits of a ray along +x."""
    count, origin, direction = 0, point.copy(), Vector((1.0, 0.0, 0.0))
    while True:
        hit, _, _, _ = tree.ray_cast(origin, direction)
        if hit is None:
            return count % 2 == 1
        count += 1
        origin = hit + direction * 1e-6


def run(moves_path, out_dir):
    """Moves the arm vertices of the move file, and writes the GLB file and the weights file.
    Gives the report lines."""
    ob, mw, bm, floor, scale = load(SOURCE)
    parts = islands(bm)
    if len(parts) != 3:
        raise SystemExit(f'{SOURCE} has {len(parts)} parts, not 3 (the trunk and two arms).')
    trunk = set(parts[0])
    faces = [[v.index for v in f.verts] for f in bm.faces if f.verts[0].index in trunk]
    points = [v.co.copy() for v in bm.verts]
    tree = BVHTree.FromPolygons(points, faces)

    def studio(co):
        return np.array([co.x * scale, (co.z - floor) * scale, -co.y * scale])

    table = np.array([studio(p) for p in points])
    with open(moves_path) as f:
        rows = json.load(f)['moves']
    lines = [f'source: {len(bm.verts)} vertices, {len(bm.faces)} triangles']
    moved = {}
    for row in rows:
        gaps = np.linalg.norm(table - np.asarray(row['point'], float), axis=1)
        i = int(np.argmin(gaps))
        if gaps[i] > 1e-4 or i in trunk:
            raise SystemExit(f'No arm vertex at {row["point"]} (nearest {gaps[i]:.6f} u).')
        p = points[i]
        near, _, _, gap = tree.find_nearest(p)
        depth = gap if inside(tree, p) else -gap
        out = (near - p) if depth > 0 else (p - near)
        moved[i] = p + out.normalized() * (row['move'] / scale)
        lines.append(f'vertex {i} at {[round(x, 3) for x in row["point"]]}: depth '
                     f'{depth * scale:.4f} u, move {row["move"]:.4f} u')
    # Each shrink moves a vertex of the root dome, at its place after the moves, a share of the
    # way to the shoulder joint of its side (`upper_arm_L` of the rig config, mirrored for the
    # right side).
    with open(CONFIG) as f:
        joint = np.asarray(json.load(f)['joints']['upper_arm_L']['head'], float)
    with open(moves_path) as f:
        shrinks = json.load(f).get('shrinks', [])
    now = table.copy()
    for i, p in moved.items():
        now[i] = studio(p)
    for row in shrinks:
        gaps = np.linalg.norm(now - np.asarray(row['point'], float), axis=1)
        i = int(np.argmin(gaps))
        if gaps[i] > 1e-4 or i in trunk:
            raise SystemExit(f'No arm vertex at {row["point"]} (nearest {gaps[i]:.6f} u).')
        target = joint * np.array([1.0 if now[i][0] > 0 else -1.0, 1.0, 1.0])
        place = now[i] + (target - now[i]) * row['share']
        moved[i] = Vector((place[0] / scale, -place[2] / scale, place[1] / scale + floor))
        lines.append(f'vertex {i} at {[round(x, 3) for x in row["point"]]}: shrink '
                     f'{row["share"]:.2f} toward the joint, '
                     f'{np.linalg.norm(target - now[i]) * row["share"]:.4f} u')
    for i, p in moved.items():
        bm.verts[i].co = p
    bm.transform(mw.inverted())
    bm.to_mesh(ob.data)
    bm.free()
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    glb = os.path.join(out_dir, OUT_GLB)
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True)
    lines.append(f'wrote {glb}, sha256 {hashlib.sha256(open(glb, "rb").read()).hexdigest()}')

    with open(WEIGHTS) as f:
        data = json.load(f)
    old = np.asarray(data['points'], float)
    for i, p in moved.items():
        gaps = np.linalg.norm(old - table[i], axis=1)
        k = int(np.argmin(gaps))
        if gaps[k] > 1e-4:
            raise SystemExit(f'{WEIGHTS}: no point at the vertex {i} (nearest {gaps[k]:.6f} u).')
        data['points'][k] = [round(float(x), 7) for x in studio(p)]
    data['note'] = (data['note'] + ' tools/blender/pig_root.py moved the vertices of '
                    'tools/arm-roots/pig-moves.json, and the weights stay.')
    path = os.path.join(out_dir, OUT_WEIGHTS)
    with open(path, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    lines.append(f'wrote {path}, sha256 {hashlib.sha256(open(path, "rb").read()).hexdigest()}')
    return lines


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    args = dict(zip(argv[0::2], argv[1::2]))
    report = run(args.get('--moves', MOVES), args.get('--out', 'assets/models/pig'))
    print('\n'.join(f'pig_root: {line}' for line in report))
