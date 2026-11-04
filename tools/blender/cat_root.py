# Output: `assets/models/cat/cat-root-weights.json`.
"""Gives the armpit patch of the right arm root of the cat more clavicle weight, in a copy of
the weights.

The T-pose arm of the cat joins the trunk under the arm root through long faces. The faces of
the armpit under the root take one mean weight (`rigidPainted` of `tools/mesh-rigs/cat.json`),
with about 0.27 on the clavicle and 0.73 on the upper arm segments, so the patch moves with the
arm as one piece. When the arm reaches forward across the chest, the patch swings to the front of
the chest, and the cut of the body at the arm root (the open loop that the sweep closes with a
fan, design 9.3) folds over the arm vertices beside it. The sweep then measures them up to 2.6 cm
inside the body.

The script gives each vertex of the patch the clavicle share `share` of its clavicle and upper
arm weights. Such a vertex follows the clavicle more than the arm, so it is a vertex of the body
(its main bone is the clavicle), and the cut moves out past the patch. Each other vertex of the
arm root with a clavicle share in `band` takes at least the share `band_share`, so that the
weights fade from the patch to the arm. The other bones of a vertex keep their weights, and the
places stay. Only the sides of `sides` change: on the left side, the rest folds of the violist
grew from 3 to 6.

    blender -b --factory-startup --python tools/blender/cat_root.py -- [--share <s>] \
        [--band <low>,<high>] [--band-share <s>] [--sides <L|R|LR>] [--out <file>]

The points are in the units and the axes of the rig config: 1 unit from the soles to the top,
the soles at y = 0, y up, +z forward, and +x the left side. A run gives the same bytes.
"""
import hashlib
import json
import sys

import bmesh
import bpy
import numpy as np

#: The input files and the output file.
SOURCE = 'assets/models/cat/cat-arms.glb'
WEIGHTS = 'assets/models/cat/cat-weights.json'
CONFIG = 'tools/mesh-rigs/cat.json'
OUT = 'assets/models/cat/cat-root-weights.json'
#: The clavicle share of the patch, the band of the clavicle share of the other root vertices,
#: their least clavicle share, and the least clavicle and arm sum of such a vertex.
SHARE = 0.52
BAND = (0.1, 0.32)
BAND_SHARE = 0.4
ARM = 0.5
#: The sides whose patch changes.
SIDES = 'R'


def load(path, weld):
    """Imports a GLB file of one mesh, welds and triangulates it in world space, as `load_mesh()`
    of `tools/blender/rig_mesh.py` does, and gives the vertices in the axes of the studio and the
    triangles."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if len(meshes) != 1:
        raise SystemExit(f'{path} has {len(meshes)} meshes, not 1.')
    ob = meshes[0]
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.transform(ob.matrix_world)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=weld)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.verts.ensure_lookup_table()
    v = np.array([p.co[:] for p in bm.verts])
    tris = np.array([[p.index for p in f.verts] for f in bm.faces], np.int64)
    bm.free()
    v = np.stack([v[:, 0], v[:, 2], -v[:, 1]], axis=1)
    floor, top = v[:, 1].min(), v[:, 1].max()
    return (v - [0.0, floor, 0.0]) / (top - floor), tris


def run(share, band, band_share, sides, out):
    """Writes the weights file with the new clavicle share of each armpit patch. Gives the report
    lines."""
    with open(CONFIG) as f:
        config = json.load(f)
    verts, tris = load(SOURCE, config['weld'])
    with open(WEIGHTS) as f:
        data = json.load(f)
    points = np.asarray(data['points'], float)
    weights = np.asarray(data['weights'], float)
    bones = data['bones']
    # Each source vertex finds its row by its place. The soften of the brow moved the places of
    # the brow in the weights file, so a vertex of the brow finds none (-1). No arm vertex is one.
    rows = []
    for v in verts:
        gaps = np.linalg.norm(points - v, axis=1)
        k = int(np.argmin(gaps))
        rows.append(k if gaps[k] <= 1e-4 else -1)
    rows = np.asarray(rows)
    middles = verts[tris].mean(axis=1)
    lines = [f'source: {len(verts)} vertices, {len(tris)} triangles']
    chosen_sides = sides
    for group in config['weights']['rigidPainted']:
        sides = {'L' if p[0] > 0 else 'R' for p in group}
        if len(sides) != 1:
            raise SystemExit('A group of rigidPainted has points on both sides.')
        side = sides.pop()
        if side not in chosen_sides:
            continue
        clavicle = bones.index(f'clavicle_{side}')
        arm = [k for k, b in enumerate(bones) if b.startswith('upper_arm_seg') and b.endswith(side)]
        faces = [int(np.argmin(np.linalg.norm(middles - np.asarray(p), axis=1))) for p in group]
        patch = set(rows[np.unique(tris[faces].ravel())].tolist())
        if -1 in patch:
            raise SystemExit(f'A corner of the patch {side} has no row in {WEIGHTS}.')
        both = weights[:, clavicle] + weights[:, arm].sum(axis=1)
        ratio = np.divide(weights[:, clavicle], both, out=np.zeros(len(both)), where=both > 0)
        near = np.nonzero((ratio >= band[0]) & (ratio <= band[1]) & (both >= ARM)
                          & (weights[:, arm].sum(axis=1) > 0))[0]
        chosen = sorted(patch | set(near.tolist()))
        for k in chosen:
            total = both[k]
            old = weights[k, arm].sum()
            own = share if k in patch else max(band_share, ratio[k])
            weights[k, arm] *= (1.0 - own) * total / old
            weights[k, clavicle] = own * total
            data['weights'][k] = [round(float(x), 6) + 0.0 for x in weights[k]]
        lines.append(f'{side}: the patch has {len(patch)} vertices, the band adds '
                     f'{len(chosen) - len(patch)}: the clavicle share {share} in the patch and at least '
                     f'{band_share} in the band')
    data['note'] = (data['note'] + f' tools/blender/cat_root.py gave each armpit patch the '
                    f'clavicle share {share}.')
    with open(out, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    lines.append(f'wrote {out}, sha256 {hashlib.sha256(open(out, "rb").read()).hexdigest()}')
    return lines


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    args = dict(zip(argv[0::2], argv[1::2]))
    low, high = (float(x) for x in args.get('--band', f'{BAND[0]},{BAND[1]}').split(','))
    report = run(float(args.get('--share', SHARE)), (low, high),
                 float(args.get('--band-share', BAND_SHARE)), args.get('--sides', SIDES),
                 args.get('--out', OUT))
    print('\n'.join(f'cat_root: {line}' for line in report))
