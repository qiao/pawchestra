# Paints the band faces of a turned paw in a map of a hand rig as a fade from the forearm fur to
# the paw fur (design 4.4, "Hand rig"). The build of the chain writes the band faces
# (tools/blender/band_faces.py). A band face keeps the UVs of the old band, so its texels continue
# the forearm at its near edge (ring A). The paw turned with its UVs, so at the far edge (ring B)
# the paw shows the fur of another side of the source, with another tone. Each texel of a band
# face at the place t from A (0) to B (1) takes the mix of its own color and the paw fur mirrored
# over ring B, with the weight smoothstep(t). Thus ring A keeps the forearm fur, ring B shows the
# paw fur, and the tone goes from one to the other along the band.
import json

import numpy as np


def _bilinear(q, s, t):
    """Gives the points of a quad [P00, P10, P11, P01] at the parameters (s, t)."""
    s, t = s[:, None], t[:, None]
    return (1 - t) * ((1 - s) * q[0] + s * q[1]) + t * ((1 - s) * q[3] + s * q[2])


def _inverse(q, p, rounds=8):
    """Gives the parameters (s, t) of the points p in the quad q, by Newton steps from the middle."""
    s = np.full(len(p), 0.5)
    t = np.full(len(p), 0.5)
    for _ in range(rounds):
        e = _bilinear(q, s, t) - p
        ds = (1 - t)[:, None] * (q[1] - q[0]) + t[:, None] * (q[2] - q[3])
        dt = (1 - s)[:, None] * (q[3] - q[0]) + s[:, None] * (q[2] - q[1])
        det = ds[:, 0] * dt[:, 1] - ds[:, 1] * dt[:, 0]
        det = np.where(np.abs(det) < 1e-12, 1e-12, det)
        s = s - (e[:, 0] * dt[:, 1] - e[:, 1] * dt[:, 0]) / det
        t = t - (ds[:, 0] * e[:, 1] - ds[:, 1] * e[:, 0]) / det
    return s, t


def _sample(a, y, x):
    """Gives the bilinear samples of an image at the texel points (y, x), with clamped edges."""
    h, w = a.shape[:2]
    y = np.clip(y, 0, h - 1)
    x = np.clip(x, 0, w - 1)
    y0, x0 = np.floor(y).astype(np.int64), np.floor(x).astype(np.int64)
    y1, x1 = np.minimum(y0 + 1, h - 1), np.minimum(x0 + 1, w - 1)
    fy, fx = (y - y0)[:, None], (x - x0)[:, None]
    return (a[y0, x0] * (1 - fx) + a[y0, x1] * fx) * (1 - fy) + (
        a[y1, x0] * (1 - fx) + a[y1, x1] * fx
    ) * fy


def read_bands(path):
    """Reads the band faces of a hand rig (tools/blender/band_faces.py)."""
    with open(path) as fh:
        return json.load(fh)


def fade_bands(image, bands):
    """Gives a copy of a map (height x width x channels, floats) with each band face painted as
    the fade. Each band reads the map before any paint.

    @param image The map, with the texel rows from the top edge.
    @param bands The band faces (read_bands()).
    @returns The painted map and the count of the painted texels.
    """
    h, w = image.shape[:2]
    out = image.copy()
    count = 0

    def pixels(uvs):
        u = np.asarray(uvs, float)
        # The texel (i, j) has its middle at u = (j + 0.5) / w and v = 1 - (i + 0.5) / h.
        return np.stack([u[:, 0] * w - 0.5, (1 - u[:, 1]) * h - 0.5], -1)

    for band in bands:
        q = pixels(band['uv'])
        paw = pixels(band['paw'])
        x0, y0 = np.floor(q.min(0)).astype(int)
        x1, y1 = np.ceil(q.max(0)).astype(int)
        yy, xx = np.mgrid[max(y0, 0) : min(y1, h - 1) + 1, max(x0, 0) : min(x1, w - 1) + 1]
        p = np.stack([xx.ravel(), yy.ravel()], -1).astype(float)
        s, t = _inverse(q, p)
        inside = (s >= -1e-6) & (s <= 1 + 1e-6) & (t >= -1e-6) & (t <= 1 + 1e-6)
        inside &= np.linalg.norm(_bilinear(q, s, t) - p, axis=1) < 0.05
        if not inside.any():
            continue
        p, s, t = p[inside], s[inside], t[inside]
        # The paw fur mirrored over ring B: the point at the depth (1 - t) times the band length
        # into the paw face, at most its whole depth.
        reach = min(1.0, band['length'] / max(band['depth'], 1e-6))
        d = (1 - t) * reach
        src = _bilinear(paw, s, d)
        weight = (t * t * (3 - 2 * t))[:, None]
        iy, ix = p[:, 1].astype(int), p[:, 0].astype(int)
        own = image[iy, ix]
        fur = _sample(image, src[:, 1], src[:, 0])
        out[iy, ix] = (1 - weight) * own + weight * fur
        count += len(p)
    return out, count
