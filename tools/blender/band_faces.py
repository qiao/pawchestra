"""Writes the turned paw bands of a hand rig for the band fade of a maps tool (tools/band_fade.py).

A paw turn (turn_paws() or turn_hooves() of a hand chain) turns the paw with its UVs, so the fur
of the color map next to the new band faces comes from another side of the paw. The band faces
keep the UVs of the old band, and only they use these texels. The maps tool paints each band face
as a fade from the forearm fur at its near edge (ring A) to the paw fur at its far edge (ring B),
so that neither ring shows a seam or a step of tone.

Each entry of the file, in Blender UVs (v up):

    {"side": "L", "uv": [A0, A1, B1, B0], "paw": [B0, B1, C1, C0], "length": L, "depth": D}

`uv` is the band face, `paw` the face of the paw at the far edge with its corners C0 and C1 after
B0 and B1 (C0 = C1 for a triangle), `length` the mean length of the band from A to B, and `depth`
the mean length of the paw face from B to C, in units.
"""

import json

import numpy as np


def _ordered(poly, a, b):
    """Gives the corner after b on the side away from a, in the cyclic order of the face."""
    vs = list(poly.vertices)
    i, j = vs.index(a), vs.index(b)
    n = len(vs)
    step = 1 if (i + 1) % n == j else -1
    return vs[(j + step) % n]


def band_entries(me, flags, S, axis_of):
    """Gives the entries of the band faces (`flags` 1 left, 2 right) of a mesh.

    @param me The mesh.
    @param flags The face attribute `band` of each face.
    @param S The vertex points in the studio axes.
    @param axis_of A function of the side ('L' or 'R') that gives the point and the unit axis of
        the rest forearm, outward.
    @returns The entries, in the order of the faces.
    """
    uv = me.uv_layers.active.data
    edge_faces = {}
    for p in me.polygons:
        for k in p.edge_keys:
            edge_faces.setdefault(k, []).append(p.index)
    out = []
    for p in me.polygons:
        if not flags[p.index]:
            continue
        side = 'L' if flags[p.index] == 1 else 'R'
        f, axis = axis_of(side)
        # The two edges that the face shares with a face out of the band: the forearm edge and the
        # paw edge. The paw edge has the neighbor farther out along the forearm axis.
        outer = []
        for k in p.edge_keys:
            other = [q for q in edge_faces[k] if q != p.index and not flags[q]]
            if other:
                q = me.polygons[other[0]]
                depth = float(np.mean((S[list(q.vertices)] - f) @ axis))
                outer.append((depth, k, q))
        assert len(outer) == 2, (p.index, len(outer))
        (_, ka, _), (_, kb, paw) = sorted(outer, key=lambda e: e[0])
        vs = list(p.vertices)
        # A0 and B0 share a side edge, as A1 and B1 do.
        a0, a1 = ka
        b0 = next(v for v in kb if {a0, v} in [set(e) for e in p.edge_keys])
        b1 = kb[0] if kb[1] == b0 else kb[1]
        loop_uv = {v: list(uv[l].uv) for l, v in zip(p.loop_indices, vs)}
        paw_uv = {v: list(uv[l].uv) for l, v in zip(paw.loop_indices, paw.vertices)}
        c0 = _ordered(paw, b1, b0)
        c1 = _ordered(paw, b0, b1)
        length = (np.linalg.norm(S[a0] - S[b0]) + np.linalg.norm(S[a1] - S[b1])) / 2
        depth = (np.linalg.norm(S[c0] - S[b0]) + np.linalg.norm(S[c1] - S[b1])) / 2
        out.append(
            {
                'side': side,
                'uv': [loop_uv[a0], loop_uv[a1], loop_uv[b1], loop_uv[b0]],
                'paw': [paw_uv[b0], paw_uv[b1], paw_uv[c1], paw_uv[c0]],
                'length': round(float(length), 6),
                'depth': round(float(depth), 6),
            }
        )
    return out


def write_bands(me, flags, S, axis_of, path):
    """Writes the entries of the band faces of a mesh (band_entries()) to a JSON file.

    @returns The count of the entries.
    """
    entries = band_entries(me, flags, S, axis_of)
    for e in entries:
        e['uv'] = [[round(x, 6) for x in u] for u in e['uv']]
        e['paw'] = [[round(x, 6) for x in u] for u in e['paw']]
    with open(path, 'w') as fh:
        json.dump(entries, fh, indent=1)
        fh.write('\n')
    return len(entries)
