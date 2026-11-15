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


def _opposite(face, e):
    a, b = e.verts
    for x in face.edges:
        if a not in x.verts and b not in x.verts:
            return x


def _ring_from(e, inside):
    """The closed ring of quads through the edge e (a strip of quads around the limb), or None."""
    edges, cur, prev = [e], e, None
    for _ in range(64):
        if len(cur.link_faces) != 2:
            return None
        f = next(x for x in cur.link_faces if x is not prev)
        if len(f.verts) != 4:
            return None
        nxt = _opposite(f, cur)
        if nxt is e:
            return edges
        if not all(inside[v.index] for v in nxt.verts):
            return None
        edges.append(nxt)
        prev, cur = f, nxt
    return None


def edge_rings(bm, inside, axis):
    """The closed quad edge rings around a limb: a list of (mean low end, mean high end along
    `axis`, edges). The ends of a ring can be loops with poles: only the strip must be quads."""
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    P = np.array([body(v.co) for v in bm.verts])
    ax = np.asarray(axis, float)
    seen, out = set(), []
    for e in bm.edges:
        a, b = e.verts
        if e.index in seen or not (inside[a.index] and inside[b.index]):
            continue
        d = P[b.index] - P[a.index]
        if abs(d @ ax) < 0.7 * np.linalg.norm(d):
            continue
        r = _ring_from(e, inside)
        if r is None:
            continue
        seen |= {x.index for x in r}
        lo = [min(P[x.verts[0].index] @ ax, P[x.verts[1].index] @ ax) for x in r]
        hi = [max(P[x.verts[0].index] @ ax, P[x.verts[1].index] @ ax) for x in r]
        out.append((float(np.mean(lo)), float(np.mean(hi)), r))
    return out
