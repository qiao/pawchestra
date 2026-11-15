"""Finds the closed edge loops around a limb and the quad bands between them (body axes)."""

import bmesh
import numpy as np


def body(co):
    return np.array([co[0], co[2], -co[1]])


def loops_around(bm, inside, axis, steep=0.5):
    """Closed edge loops of the edges in `inside` (a bool per vertex) that stand across `axis`.
    Gives a list of (mean along, vertex indices, closed, reason)."""
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    P = np.array([body(v.co) for v in bm.verts])
    ax = np.asarray(axis, float)
    ax /= np.linalg.norm(ax)
    seen, out = set(), []
    for e in bm.edges:
        a, b = e.verts
        if e.index in seen or not (inside[a.index] and inside[b.index]):
            continue
        d = P[b.index] - P[a.index]
        if abs(d @ ax) > steep * np.linalg.norm(d):
            continue
        seen.add(e.index)
        verts, closed, reason = [a.index, b.index], False, ''
        for direction in (0, 1):
            cur, v = e, (b if direction == 0 else a)
            while True:
                if len(v.link_edges) != 4:
                    reason += f'pole{v.index} '
                    break
                faces = set(cur.link_faces)
                nxt = [x for x in v.link_edges if x is not cur and not (set(x.link_faces) & faces)]
                if len(nxt) != 1:
                    reason += f'tri{v.index} '
                    break
                cur = nxt[0]
                if cur is e:
                    closed = True
                    break
                if cur.index in seen:
                    break
                seen.add(cur.index)
                v = cur.other_vert(v)
                if not inside[v.index]:
                    reason += 'leaves '
                    break
                if direction == 0:
                    verts.append(v.index)
                else:
                    verts.insert(0, v.index)
            if closed:
                verts = verts[:-1] if verts[-1] == verts[0] else verts
                break
        out.append((float(np.mean(P[verts] @ ax)), verts, closed, reason.strip()))
    return out, P


def band_ring(bm, loop_a, loop_b):
    """The edges that join each vertex of loop_a to loop_b, when the band between is a clean quad
    edge ring (each vertex of a has one edge to b, each face of the band a quad). Else None."""
    bm.verts.ensure_lookup_table()
    sb = set(loop_b)
    edges = []
    for i in loop_a:
        v = bm.verts[i]
        to_b = [e for e in v.link_edges if e.other_vert(v).index in sb]
        if len(to_b) != 1:
            return None
        edges.append(to_b[0])
    if len(set(e.other_vert(bm.verts[i]).index for e, i in zip(edges, loop_a))) != len(loop_b):
        return None
    faces = set()
    for e in edges:
        faces |= set(e.link_faces)
    if any(len(f.verts) != 4 for f in faces) or len(faces) != len(edges):
        return None
    return edges


def band_next(bm, loop_a, axis, direction):
    """The band next to the closed loop loop_a on the side `direction` (+1 or -1) along `axis`:
    for each vertex of loop_a, its one edge that leaves the loop to that side. The far loop can hold
    poles (the arm of the beagle reduces its rings at the elbow). Gives (edges, far mean along) when
    the band is a clean quad ring (one quad for each edge), else None."""
    bm.verts.ensure_lookup_table()
    ax = np.asarray(axis, float)
    ax /= np.linalg.norm(ax)
    sa_ = set(loop_a)
    P = lambda v: body(v.co) @ ax
    edges, far = [], []
    for i in loop_a:
        v = bm.verts[i]
        cand = [
            e
            for e in v.link_edges
            if e.other_vert(v).index not in sa_ and direction * (P(e.other_vert(v)) - P(v)) > -0.003
        ]
        if len(cand) != 1:
            return None
        edges.append(cand[0])
        far.append(cand[0].other_vert(v).index)
    if len(set(far)) != len(loop_a):
        return None
    sf = sa_ | set(far)
    faces = {f for e in edges for f in e.link_faces if all(w.index in sf for w in f.verts)}
    if len(faces) != len(edges) or any(len(f.verts) != 4 for f in faces):
        return None
    return edges, float(np.mean([P(bm.verts[j]) for j in far]))
