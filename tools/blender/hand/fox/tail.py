"""The tail of the Tripo fox as a tube along a middle line, in the body axes (pure numpy).

The source tail of the third cat leaves the back at y 0.36 (before the longer shins), hangs down behind the legs,
and its end hooks back. The middle line comes from the edge distance from the tip vertex: the
vertices in each band of the distance form a ring of the tube, and the middle of each ring is a
point of the line. build.py gives the tube exact rows along the line (tail_rows()) and lays it on
the seat with the key `bind_tail` (tail_key()).
"""

import heapq

import numpy as np


def smoothstep(a, b, x):
    t = np.clip((np.asarray(x, float) - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def edge_distance(S, edges, start):
    """The length of the shortest edge path from the vertex `start` to each vertex."""
    nbr = [[] for _ in range(len(S))]
    for a, b in edges:
        length = float(np.linalg.norm(S[a] - S[b]))
        nbr[a].append((b, length))
        nbr[b].append((a, length))
    dist = np.full(len(S), np.inf)
    dist[start] = 0.0
    heap = [(0.0, start)]
    while heap:
        d, i = heapq.heappop(heap)
        if d > dist[i]:
            continue
        for j, length in nbr[i]:
            if d + length < dist[j]:
                dist[j] = d + length
                heapq.heappush(heap, (d + length, j))
    return dist


def tip_vertex(S):
    """The tip of the tail of the fox: the lowest vertex behind the legs (z below -0.1)."""
    back = np.nonzero(S[:, 2] < -0.1)[0]
    return int(back[np.argmin(S[back, 1])])


def middle_line(S, edges, rule, mask=None):
    """Gives the middle line of the tail from the root ring to the tip (n x 3), and the edge
    distance of each vertex from the tip. The line points are the middles of the bands of the
    distance from 0 to `rule['junction']`, `rule['band']` wide, smoothed twice by (1/4, 1/2, 1/4)
    with the two ends kept."""
    dist = edge_distance(S, edges, tip_vertex(S))
    band = rule['band']
    end = rule['junction'] if mask is None else float(dist[mask].max())
    points = []
    for a in np.arange(0.0, end, band):
        ring = (dist >= a) & (dist < a + band) & (True if mask is None else mask)
        if ring.sum() >= 3:
            points.append(S[ring].mean(axis=0))
    line = np.array(points[::-1])
    for _ in range(2):
        line[1:-1] = 0.25 * line[:-2] + 0.5 * line[1:-1] + 0.25 * line[2:]
    return line, dist


def line_place(points, line):
    """Gives the place of each point along the polyline (its length from the first point to the
    nearest point of the line), the distance from the line, and the index of the nearest span.
    The first span goes on back past the first point, so that a point above the root of the tail
    has a place below 0."""
    best = np.full(len(points), np.inf)
    place = np.zeros(len(points))
    span = np.zeros(len(points), int)
    start = 0.0
    for k, (a, b) in enumerate(zip(line[:-1], line[1:])):
        d = b - a
        length = float(np.linalg.norm(d))
        t = np.clip((points - a) @ d / (length * length), -np.inf if k == 0 else 0.0, 1.0)
        gap = np.linalg.norm(points - (a + t[:, None] * d), axis=1)
        near = gap < best
        best[near] = gap[near]
        place[near] = start + t[near] * length
        span[near] = k
        start += length
    return place, best, span


def tube_mask(S, line, dist, rule):
    """The vertices of the tail tube: within `rule['reach']` of the edge distance of the junction
    from the tip, and within `rule['radius']` of the middle line."""
    place, gap, _ = line_place(S, line)
    return (dist <= rule['junction'] + rule['reach']) & (gap <= rule['radius']), place


def curve(points, steps=40):
    """Samples of a Catmull-Rom curve through the points, with the length at each sample."""
    p = np.asarray(points, float)
    ext = np.vstack([2 * p[0] - p[1], p, 2 * p[-1] - p[-2]])
    out = []
    for i in range(len(p) - 1):
        p0, p1, p2, p3 = ext[i : i + 4]
        for t in np.linspace(0.0, 1.0, steps + 1)[:-1]:
            out.append(
                0.5
                * (
                    2 * p1
                    + (p2 - p0) * t
                    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                    + (3 * p1 - p0 - 3 * p2 + p3) * t**3
                )
            )
    out.append(p[-1])
    out = np.asarray(out)
    return out, np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(out, axis=0), axis=1))])


def tangents(samples):
    t = np.gradient(samples, axis=0)
    return t / np.linalg.norm(t, axis=1)[:, None]


def frames(samples, tang, normal):
    """The rotation-minimizing frames (double reflection) of a sampled curve: columns normal,
    binormal, tangent. The first normal is `normal` made normal to the first tangent."""
    r = normal - (normal @ tang[0]) * tang[0]
    r = r / np.linalg.norm(r)
    out = []
    for i in range(len(samples)):
        t = tang[i]
        out.append(np.stack([r, np.cross(t, r), t], axis=1))
        if i + 1 == len(samples):
            break
        v1 = samples[i + 1] - samples[i]
        c1 = v1 @ v1
        if c1 < 1e-16:
            continue
        r_l = r - (2.0 / c1) * (v1 @ r) * v1
        t_l = t - (2.0 / c1) * (v1 @ t) * v1
        v2 = tang[i + 1] - t_l
        c2 = v2 @ v2
        r = r_l if c2 < 1e-16 else r_l - (2.0 / c2) * (v2 @ r_l) * v2
    return np.asarray(out)


def lay(points, place, line, turn, root, path, roll=0.0):
    """Moves the tube points of the rest (place along the rest middle line `line`) onto the path
    of the bind: each point keeps its place along the line and its offset in the moving frame of
    the line, and takes the same place along the path (`root` plus the Catmull-Rom curve through
    `path`, relative to the root), with the offset in the moving frame of the path. `turn` is the
    bind turn of the root (3 x 3), which takes the first frame of the line to the first frame of
    the path before the swing onto the first path tangent. `roll` turns the offsets about the path
    (radians). A place past the end of the path goes on along its last tangent."""
    s_pts, s_len = curve(line, 10)
    s_tan = tangents(s_pts)
    s_frm = frames(s_pts, s_tan, np.array([1.0, 0.0, 0.0]))
    c_pts, c_len = curve(np.vstack([[0.0, 0.0, 0.0], path]) + root)
    c_tan = tangents(c_pts)
    first = turn @ s_frm[0][:, 0]
    c_frm = frames(c_pts, c_tan, first)
    s_at = np.clip(np.searchsorted(s_len, place, side='right') - 1, 0, len(s_len) - 1)
    c_at = np.clip(np.searchsorted(c_len, place, side='right') - 1, 0, len(c_len) - 1)
    near = s_pts[s_at] + s_tan[s_at] * (place - s_len[s_at])[:, None]
    offset = np.einsum('nji,nj->ni', s_frm[s_at], points - near)
    c, s = np.cos(roll), np.sin(roll)
    offset = np.c_[
        c * offset[:, 0] - s * offset[:, 1], s * offset[:, 0] + c * offset[:, 1], offset[:, 2]
    ]
    return (
        (
            c_pts[c_at]
            + c_tan[c_at] * (place - c_len[c_at])[:, None]
            + np.einsum('nij,nj->ni', c_frm[c_at], offset)
        ),
        float(s_len[-1]),
        float(c_len[-1]),
    )
