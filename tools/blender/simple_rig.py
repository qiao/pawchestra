"""Rigs a source mesh into the `.blend` of a studio body by the simple route: no cut, no cap, no
remesh, no rebuild of the arms, and no edit of the mesh.

    blender -b --factory-startup --python tools/blender/simple_rig.py -- <config.json> \
        --out <dir>/<animal>.blend [--smooth <passes>]

Then `pnpm rig-export <animal> --blend <dir>/<animal>.blend --out <dir>/<animal>.rig.glb` writes
the GLB file of the body, and `pnpm studio-body <animal>` writes its module.

The steps:
 1. Import the source mesh, weld its vertices, and make each face flat.
 2. Give each face the color of the texture, and make the nose gloss (`add_surface()`).
 3. Add the armature of the app at the joints of the config, in the T-pose of the mesh, with the
    Action `bind` of the seat rules of the config (`build_armature()`).
 4. Give the weights by bone heat (Automatic Weights). The arm segments and the helpers take
    their weights by the same bone heat. Then smooth the weights over the mesh edges in a few
    Laplacian passes, keep the 4 largest weights of each vertex, and normalize them.
 5. Put a pea eye on each old eye, write the facts of the body, and save the file.
"""

import json
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import studio_armature as sa  # noqa: E402
import studio_eyes as se  # noqa: E402

#: The weight smooth of the test rig: the number of passes, and the share of the mean of the
#: neighbors that each pass gives a vertex.
SMOOTH_PASSES, SMOOTH_SHARE = 3, 0.5

#: The smallest weight that a vertex keeps after the smooth.
SMALLEST = 1e-3


def smooth_weights(body, passes, share):
    """Smooths the bone weights over the mesh edges, then keeps the 4 largest weights of each
    vertex and normalizes them. Bone heat gives a sharp step where the T-pose arm meets the chest,
    and the smooth spreads it over a few rings of vertices."""
    me = body.data
    n, groups = len(me.vertices), list(body.vertex_groups)
    w = np.zeros((n, len(groups)))
    for v in me.vertices:
        for g in v.groups:
            w[v.index, g.group] = g.weight
    edges = np.empty(len(me.edges) * 2, int)
    me.edges.foreach_get('vertices', edges)
    a, b = edges.reshape(-1, 2).T
    count = np.bincount(np.concatenate([a, b]), minlength=n).astype(float)
    for _ in range(passes):
        total = np.zeros_like(w)
        np.add.at(total, a, w[b])
        np.add.at(total, b, w[a])
        mean = np.divide(total, count[:, None], out=w.copy(), where=count[:, None] > 0)
        w = w * (1 - share) + mean * share

    # The 4 largest weights of each vertex, each at least SMALLEST, with a sum of 1.
    order = np.argsort(-w, axis=1)
    w[np.arange(n)[:, None], order[:, sa.INFLUENCES :]] = 0.0
    w[w < SMALLEST] = 0.0
    w /= w.sum(axis=1, keepdims=True)
    for k, group in enumerate(groups):
        group.remove(range(n))
        for i in np.nonzero(w[:, k])[0]:
            group.add([int(i)], float(w[i, k]), 'REPLACE')


def tone_faces(body, rm, rule):
    """Moves the plain fur toward the color of the sheet (`colors.tone` of the config, `tone()` of
    `rig_mesh.py`), as the rig of the T-pose rabbit did."""
    me = body.data
    for name in ('color', 'color_base'):
        rgba = np.empty(len(me.polygons) * 4, np.float32)
        me.attributes[name].data.foreach_get('color', rgba)
        rgba = rgba.reshape(-1, 4)
        srgb = np.clip(rgba[:, :3], 0, 1)
        srgb = np.where(srgb <= 0.0031308, srgb * 12.92, 1.055 * srgb ** (1 / 2.4) - 0.055)
        moved, _ = rm['tone'](srgb, np.zeros(len(srgb), int), rule)
        rgba[:, :3] = rm['linear'](moved)
        me.attributes[name].data.foreach_set('color', rgba.ravel())


def old_eyes(body, config, rm):
    """Gives the middle (the front of the dome) and the facing of each old eye of the source, by
    side, in Blender axes of the rest: the dark faces in the eye box (`features()` of
    `rig_mesh.py`)."""
    me = body.data
    me.calc_loop_triangles()
    tris = np.array([t.vertices[:] for t in me.loop_triangles])
    owner = np.array([t.polygon_index for t in me.loop_triangles])
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    texture = sa.base_texture(os.path.join(sa.ROOT, config['source']))
    rgb, dark = sa.polygon_colors(me, texture, config['colors'], rm)
    eyes, _ = rm['features'](co @ sa.TO_STUDIO.T, tris, rgb[owner], dark[owner], config['colors'])
    out = {}
    for side, faces in eyes.items():
        corners = co[tris[faces]]
        normal = np.cross(corners[:, 1] - corners[:, 0], corners[:, 2] - corners[:, 0]).sum(axis=0)
        facing = normal / np.linalg.norm(normal)
        points = corners.reshape(-1, 3)
        middle = points.mean(axis=0)
        out[side] = (middle + facing * ((points - middle) @ facing).max(), facing)
    return out


def main():
    """Builds the `.blend` of the config of the arguments."""
    rest = sys.argv[sys.argv.index('--') + 1 :]
    with open(rest[0]) as f:
        config = json.load(f)
    out = os.path.abspath(rest[rest.index('--out') + 1])
    passes = int(rest[rest.index('--smooth') + 1]) if '--smooth' in rest else SMOOTH_PASSES
    rm = sa.rig_mesh_lib()
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # 1. The source mesh, welded, with flat faces.
    body = sa.import_source(os.path.join(sa.ROOT, config['source']), config['weld'])
    body.data.polygons.foreach_set('use_smooth', [False] * len(body.data.polygons))
    eyes = old_eyes(body, config, rm)

    # 2. The face colors and the gloss nose.
    animal = os.path.splitext(os.path.basename(out))[0]
    counts = sa.add_surface(body, animal, config['source'], eye_fans=False, config=config)
    tone_faces(body, rm, config['colors']['tone'])

    # 3. The armature in the T-pose of the mesh, and the seated bind.
    rm['BONES'] = sa.config_bones(rm, config)
    rig = sa.build_armature(config, rm)

    # 4. Bone heat, then the smooth of the weights.
    empty = sa.skin_mesh(body, rig, auto=True)
    smooth_weights(body, passes, SMOOTH_SHARE)
    gloss = sorted({v for p in body.data.polygons if p.material_index == 1 for v in p.vertices})
    for group in body.vertex_groups:
        group.remove(gloss)
    body.vertex_groups['head'].add(gloss, 1.0, 'REPLACE')

    # 5. The eyes in the bind, the facts of the body, and the file.
    head = sa.action_worlds(rig, bpy.data.actions['bind'])['head']
    rest_head = sa.m64(rig.data.bones['head'].matrix_local)
    move = head @ np.linalg.inv(rest_head)
    se.place_eyes(
        rig,
        body,
        {
            side: (move[:3, :3] @ middle + move[:3, 3], move[:3, :3] @ facing, config['eyeSize'])
            for side, (middle, facing) in eyes.items()
        },
    )
    for name, value in config['body'].items():
        rig[name] = value
    body.name, rig.name = animal, f'{animal}_rig'
    bpy.data.orphans_purge(do_recursive=True)
    bpy.ops.wm.save_as_mainfile(filepath=out)
    print(
        f'simple_rig: wrote {out}: {counts}, {len(rig.data.bones)} bones, {empty} vertices with '
        f'no bone heat, {passes} smooth passes',
        flush=True,
    )


if __name__ == '__main__':
    main()
