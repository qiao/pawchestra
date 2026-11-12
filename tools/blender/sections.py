# Output: the cuts of a mesh that give the joint places of `tools/mesh-rigs/panda.json`
# at cbc8db5e4.
"""Prints horizontal sections of the rabbit mesh, in the units of the studio.

    blender -b --factory-startup --python tools/blender/sections.py -- <rabbit-4.glb> [axis] [step]

The mesh is welded at 1e-5 and scaled to 1 unit from the soles to the ear tips, with the soles at
y = 0, in the axes of the studio (y up, +z forward, +x the left side of the animal). For each cut
at the height y (or at x or z with the axis argument), it prints each closed loop of the cut (one part
of the body): the range on each of the two other axes.
"""

import sys

import bmesh
import bpy
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1 :]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=argv[0])
axis = 'xyz'.index(argv[1]) if len(argv) > 1 else 1
step = float(argv[2]) if len(argv) > 2 else 0.02
ob = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
bm = bmesh.new()
bm.from_mesh(ob.data)
bm.transform(ob.matrix_world)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bmesh.ops.triangulate(bm, faces=bm.faces)
bm.verts.ensure_lookup_table()
v = np.array([list(x.co) for x in bm.verts])
v = np.stack([v[:, 0], v[:, 2], -v[:, 1]], axis=1)
tris = np.array([[x.index for x in f.verts] for f in bm.faces])
lo, hi = v[:, 1].min(), v[:, 1].max()
v = (v - [0, lo, 0]) / (hi - lo)
print('scale', 1 / (hi - lo), 'floor', lo, 'vertices', len(v), 'triangles', len(tris))
print('box', v.min(0).round(4), v.max(0).round(4))
others = [a for a in range(3) if a != axis]
for h in np.arange(v[:, axis].min() + step / 2, v[:, axis].max(), step):
    # Each triangle across the cut gives one segment between two edge points. The segments that
    # share an edge point are one loop of the cut: one part of the body.
    points = {}
    parent = {}

    def root(k):
        while parent[k] != k:
            k = parent[k]
        return k

    for t in tris:
        d = v[t, axis] - h
        keys = []
        for i in range(3):
            a, b = t[i], t[(i + 1) % 3]
            da, db = d[i], d[(i + 1) % 3]
            if (da < 0) != (db < 0):
                key = (min(a, b), max(a, b))
                points[key] = v[a] + (v[b] - v[a]) * (da / (da - db))
                parent.setdefault(key, key)
                keys.append(key)
        if len(keys) == 2:
            parent[root(keys[1])] = root(keys[0])
    loops = {}
    for key, p in points.items():
        loops.setdefault(root(key), []).append(p)
    text = []
    for g in sorted(loops.values(), key=lambda g: np.mean([p[others[0]] for p in g])):
        g = np.array(g)
        if len(g) < 3:
            continue
        a, b = others
        text.append(
            f"{'xyz'[a]} {g[:, a].min():+.3f}..{g[:, a].max():+.3f} {'xyz'[b]} {g[:, b].min():+.3f}..{g[:, b].max():+.3f}"
        )
    print(f"{'xyz'[axis]}={h:.3f}: " + ' | '.join(text))
