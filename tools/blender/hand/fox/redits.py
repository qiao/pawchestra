"""Point edits of the rest mesh of the new Tripo rabbit, as pure maps of points in the studio axes (y up,
+z forward, +x the left side). The build (build.py) moves the mesh with them, and
make_config.py moves the joints with the same maps, so that the bones fit the edited mesh."""

import numpy as np


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def tail_share(X, params=None):
    """1 for a point of the tail, 0 for each other point. The tail of the fox is a loose part of
    the source, so the caller gives its mask as params['_tail'] (a bool or float array for X)."""
    t = (params or {}).get('_tail')
    if t is None:
        return np.zeros(len(X))
    return np.asarray(t, float)


def legs(X, e, params):
    """Makes the legs longer along y (the height), as the fox legs (assets/models/fox/README.md,
    "Longer legs"): g(y) = y + (k - 1) G(y), G the integral of the band b from 0 to y. b is 0 below
    a, a smoothstep to 1 at b, 1 to c, a smoothstep to 0 at d. A tail point moves up by the full
    rise. x and z stay."""
    k, (a, b, c, d) = e['k'], e['band']
    ys = np.linspace(0, 1.2, 12001)
    band = smoothstep(a, b, ys) * (1 - smoothstep(c, d, ys))
    G = np.concatenate([[0], np.cumsum((band[1:] + band[:-1]) / 2 * np.diff(ys))])
    rise = (k - 1) * G[-1]
    g = X[:, 1] + (k - 1) * np.interp(X[:, 1], ys, G)
    t = tail_share(X, params)
    Y = X.copy()
    Y[:, 1] = X[:, 1] + (1 - t) * (g - X[:, 1]) + t * rise
    return Y


def head(X, e, params):
    """Scales the head about the point `center` by s, with a share w that goes from 0 at the
    height a to 1 at the height b (a smoothstep), so that the neck fades."""
    c, s = np.array(e['center'], float), e['scale']
    w = smoothstep(e['fade'][0], e['fade'][1], X[:, 1])[:, None]
    return X + w * (s - 1) * (X - c)


def paw(X, e, params):
    """Scales each paw past the wrist in the frame of the paw (assets/models/fox/README.md, "Paw
    size"): origin the wrist joint c, a the rest forearm axis, w the width axis (the left width
    axis of the source, turned with the paw of the side), n = a x w. With d the distance along a
    and s = smoothstep(0, ramp, d), the point c + (1 - (1 - L) s) d a + (1 - (1 - W) s) (v . w) w +
    (1 - (1 - T) s) (v . n) n takes its place. The points up to the wrist joint stay."""
    Y = X.copy()
    for side, sign in (('L', 1.0), ('R', -1.0)):
        m = np.array([sign, 1, 1])
        f, a = paw_axis(params['sourceJoints'], side)
        c = np.array(params['sourceJoints']['hand_L']['head'], float) * m
        # An arm of the edit armStretch moves the wrist joint and the forearm joint along the arm
        # line, so the frame of the paw takes their places after that edit.
        stretch = next((ed for ed in params.get('edits', []) if ed['kind'] == 'armStretch'), None)
        if stretch is not None:
            f, c = arm_stretch(np.array([f, c]), stretch, dict(params, _joints=True))
            a = (c - f) / np.linalg.norm(c - f)
        w = rotation(a, paw_turn_angle(params, side)) @ (np.array(e['width'], float) * m)
        w -= (w @ a) * a
        w /= np.linalg.norm(w)
        n = np.cross(a, w)
        v = X - c
        d = v @ a
        on = (sign * X[:, 0] > 0.15) & (d > 0)
        s = smoothstep(0, e['ramp'], d)
        L = 1 - (1 - e['length']) * s
        W = 1 - (1 - e['wide']) * s
        T = 1 - (1 - e.get('thick', 1.0)) * s
        new = c + (L * d)[:, None] * a + (W * (v @ w))[:, None] * w + (T * (v @ n))[:, None] * n
        Y[on] = new[on]
    return Y


def eyes(X, e, params):
    """Scales each eyeball and its socket about the middle of the sphere of the eyeball of its side
    (`centers`, L and R) by s: each point of the side within r_in of the middle moves toward it by
    s, and the share falls by a smoothstep to 0 at r_out, so the socket and its lining shrink with
    the ball (assets/models/fox/README.md, "Eye size"). Past the ball (r_ball to r_in), the share
    also falls by a smoothstep toward the middle plane (x from `mid` to 0), so that the skin between
    the eyes does not part, and the ball keeps its form. The
    whiskers and the nose (points in front of z_keep) stay."""
    Y = X.copy()
    for side, sign in (('L', 1.0), ('R', -1.0)):
        c = np.array(e['centers'][side], float)
        dist = np.linalg.norm(X - c, axis=1)
        near_mid = (1 - smoothstep(0.0, e['mid'], sign * X[:, 0])) * smoothstep(
            e['rBall'], e['rIn'], dist
        )
        w = (1 - smoothstep(e['rIn'], e['rOut'], dist)) * (1 - near_mid)
        w[(sign * X[:, 0] <= 0) | (X[:, 2] > e['zKeep'])] = 0
        # The eyeballs of the cat reach over the middle plane into the head, so each ball scales
        # as one piece about its middle: 1 on its own ball, 0 on the other ball.
        ball = eye_balls(X, params)
        if ball is not None:
            w[ball == sign] = 1
            w[ball == -sign] = 0
        D = w[:, None] * (e['scale'] - 1) * (X - c)
        if ball is not None and e.get('sink'):
            # The ball of the side also moves back into its socket by `sink` units along the eye
            # axis `axis` (the left side, x mirrored on the right), so that the skin edge meets
            # the ball and the ball does not bulge out of the face.
            g = np.array(e['axis'], float) * [sign, 1, 1]
            g /= np.linalg.norm(g)
            D[ball == sign] -= e['sink'] * g
        if 'yKeep' in e:
            # The points below the eyes fade out of the edit (a smoothstep from 0 at yKeep[0] to
            # 1 at yKeep[1]), so that the muzzle and the mouth stay.
            D *= (
                smoothstep(e['yKeep'][0], e['yKeep'][1], X[:, 1])[:, None]
                if ball is None
                else np.where(
                    ball[:, None] != 0,
                    1.0,
                    smoothstep(e['yKeep'][0], e['yKeep'][1], X[:, 1])[:, None],
                )
            )
        if ball is not None:
            keep = ball == 0
            D[keep] = rigid_parts(
                X[keep], D[keep], dict(params, _part=np.asarray(params['_part'])[keep])
            )
        Y += D
    return Y


def eye_balls(X, params):
    """The side of the eyeball of each point (1 left, -1 right, 0 none): the loose parts with a
    point count inside `ballVerts` of the params (default 50 to 100, params['_part']), by the
    sign of their middle x. None with no parts."""
    part = (params or {}).get('_part')
    if part is None:
        return None
    part = np.asarray(part)
    lo, hi = params.get('ballVerts', (50, 100))
    out = np.zeros(len(X))
    for p in np.unique(part[part >= 0]):
        ids = part == p
        if lo < ids.sum() < hi:
            out[ids] = np.sign(X[ids, 0].mean())
    return out


def shin(X, e, params):
    """Makes each shin thicker: each point of the leg moves away from the line from the ankle
    joint to the knee joint of its side, in the plane of its height (x and z), by the factor
    1 + (k - 1) b(y), with b a smoothstep from 0 at y a to 1 at y b, 1 to y c, and a smoothstep
    to 0 at y d. The joints lie on the line, so they stay. A tail point and each point farther
    than `reach` from the line stay."""
    Y = X.copy()
    a, b, c, d = e['band']
    bump = smoothstep(a, b, X[:, 1]) * (1 - smoothstep(c, d, X[:, 1]))
    t = tail_share(X, params)
    for sign in (1.0, -1.0):
        m = np.array([sign, 1, 1])
        lo = np.array(params['sourceJoints']['foot_L']['head'], float) * m
        hi = np.array(params['sourceJoints']['shin_L']['head'], float) * m
        u = np.clip((X[:, 1] - lo[1]) / (hi[1] - lo[1]), -1, 2)
        axis = lo + u[:, None] * (hi - lo)
        off = X - axis
        off[:, 1] = 0
        near = (np.linalg.norm(off, axis=1) < e['reach']) & (sign * X[:, 0] > 0.0)
        f = (1 + (e['k'] - 1) * bump) * (1 - t) + t
        Y[near] = axis[near] + off[near] * f[near, None] + (X[near] - axis[near] - off[near])
    return Y


def arm_girth(X, e, params):
    """Makes each arm thicker: each point of the arm moves away from the line of the rest arm (from
    the shoulder joint to the wrist joint of its side) in the plane square to the line, by the
    factor k(x) of `table` ([x, k] rows, linear between them, x of the left side). The share fades
    from 1 at the distance `reach`[0] from the line to 0 at `reach`[1], so that the trunk, the head,
    and the whiskers stay. The joints lie on the line, so they stay."""
    Y = X.copy()
    tab = np.array(e['table'], float)
    r0, r1 = e['reach']
    for sign in (1.0, -1.0):
        m = np.array([sign, 1, 1])
        a = np.array(params['sourceJoints']['upper_arm_L']['head'], float) * m
        b = np.array(params['sourceJoints']['hand_L']['head'], float) * m
        u = (b - a) / np.linalg.norm(b - a)
        v = X - a
        t = v @ u
        off = v - np.outer(t, u)
        dist = np.linalg.norm(off, axis=1)
        x = sign * X[:, 0]
        k = np.interp(x, tab[:, 0], tab[:, 1])
        w = (
            (1 - smoothstep(r0, r1, dist))
            * (sign * X[:, 0] > 0)
            * (X[:, 1] > e['y'][0])
            * (X[:, 1] < e['y'][1])
        )
        Y += (w * (k - 1))[:, None] * off
    return Y


def eye_clear(X, e, params):
    """1 away from both eyes, 0 near them: a smoothstep from 0 at the distance eyeClear[0] to 1 at
    eyeClear[1] from the middle of the nearer eyeball (`centers` of the edit `eyes`)."""
    ce_ = next(x for x in params['edits'] if x['kind'] == 'eyes')['centers']
    d = np.min([np.linalg.norm(X - np.array(ce_[s], float), axis=1) for s in ('L', 'R')], axis=0)
    return smoothstep(e['eyeClear'][0], e['eyeClear'][1], d)


def rigid_parts(X, D, params):
    """Gives each loose part (params['_part'], the part id of each point, -1 for the body) the
    move of its middle, so that a whisker or a brow strip moves as one piece."""
    part = (params or {}).get('_part')
    if part is None:
        return D
    part = np.asarray(part)
    for p in np.unique(part[part >= 0]):
        ids = part == p
        D[ids] = D[ids].mean(axis=0)
    return D


def cheeks(X, e, params):
    """Makes the cheeks rounder: each point near the cheek point of its side (`center`, the left
    side, mirrored on the right) moves by `push` units along `dir` (the left side, mirrored), with a
    share of 1 to the distance reach[0] and a smoothstep to 0 at reach[1]. The share is 0 near the
    eyes (eye_clear()), so the sockets keep their form. The eyeballs stay, and each loose part
    moves as one piece."""
    D = np.zeros_like(X)
    clear = eye_clear(X, e, params)
    eye = np.asarray(
        (params or {}).get('_eyeSide')
        if (params or {}).get('_eyeSide') is not None
        else np.zeros(len(X))
    )
    for sign in (1.0, -1.0):
        m = np.array([sign, 1, 1])
        c = np.array(e['center'], float) * m
        u = np.array(e['dir'], float) * m
        u /= np.linalg.norm(u)
        dist = np.linalg.norm(X - c, axis=1)
        w = (1 - smoothstep(e['reach'][0], e['reach'][1], dist)) * clear * (sign * X[:, 0] > 0)
        D += (e['push'] * w)[:, None] * u
    D[eye != 0] = 0
    return X + rigid_parts(X, D, params)


def muzzle(X, e, params):
    """Makes the muzzle shorter: each point moves back (-z) by (1 - k) G(z), G the integral of the
    band b from the back to z. b is 0 below z a, a smoothstep to 1 at b, 1 to c, and a smoothstep to
    0 at d, so the part in front of d (the nose) moves back as one piece, and the band from a to d
    gets shorter. The share fades by y: 1 from y[1] to y[2], a smoothstep to 0 below y[0] and above
    y[3], so the forehead and the chest stay. The share is 0 near the eyes (eye_clear()). The
    eyeballs and the tail stay, and each loose part moves as one piece."""
    a, b, c, d = e['band']
    zs = np.linspace(-0.3, 0.4, 7001)
    band = smoothstep(a, b, zs) * (1 - smoothstep(c, d, zs))
    G = np.concatenate([[0], np.cumsum((band[1:] + band[:-1]) / 2 * np.diff(zs))])
    y0, y1, y2, y3 = e['y']
    wy = smoothstep(y0, y1, X[:, 1]) * (1 - smoothstep(y2, y3, X[:, 1]))
    w = wy * eye_clear(X, e, params) * (1 - tail_share(X, params))
    D = np.zeros_like(X)
    D[:, 2] = -(1 - e['k']) * np.interp(X[:, 2], zs, G) * w
    eye = (params or {}).get('_eyeSide')
    if eye is not None:
        D[np.asarray(eye) != 0] = 0
    return X + rigid_parts(X, D, params)


def head_wide(X, e, params):
    """Makes the head wider: each point moves away from the middle plane by (s - 1) w x, with w a
    smoothstep from 0 at the height fade[0] to 1 at fade[1], so that the neck fades. Each loose
    part (an eyeball, a whisker strip) moves as one piece, so the balls keep their form."""
    w = smoothstep(e['fade'][0], e['fade'][1], X[:, 1])
    D = np.zeros_like(X)
    D[:, 0] = (e['scale'] - 1) * w * X[:, 0]
    return X + rigid_parts(X, D, params)


def mouth_fill(X, e, params):
    """Makes the mouth slit shallow, so the thick dark line of its shade gets thin and short: each
    point in the box `box` (x half width, y range, z range) more than the depth `keep` behind the
    front skin (the largest z of the points within `near` of it in x and y) moves forward to that
    depth. keep is keep[0] at the middle plane and keep[1] from |x| wide[1] on (a smoothstep from
    wide[0]), so the line fades to the corners. The loose parts stay."""
    Y = X.copy()
    (hx, y0, y1, z0, z1) = e['box']
    inside = (
        (np.abs(X[:, 0]) < hx) & (X[:, 1] > y0) & (X[:, 1] < y1) & (X[:, 2] > z0) & (X[:, 2] < z1)
    )
    part = (params or {}).get('_part')
    if part is not None:
        # The loose parts stay: the eyeballs, and the inside of the mouth, which would show
        # through the lips as a tongue.
        inside &= np.asarray(part) < 0
    ids = np.nonzero(inside)[0]
    if not len(ids):
        return Y
    Q = X[ids]
    front = np.array(
        [
            Q[(np.abs(Q[:, 0] - q[0]) < e['near']) & (np.abs(Q[:, 1] - q[1]) < e['near']), 2].max()
            for q in Q
        ]
    )
    keep = e['keep'][0] + (e['keep'][1] - e['keep'][0]) * smoothstep(
        e['wide'][0], e['wide'][1], np.abs(Q[:, 0])
    )
    D = np.zeros_like(X)
    D[ids, 2] = np.maximum(front - keep - Q[:, 2], 0)
    return X + D


def box_distance(X, box):
    """The distance of each point from the box `box` ([lo, hi] corners), 0 inside."""
    lo, hi = np.array(box[0], float), np.array(box[1], float)
    return np.linalg.norm(np.maximum(np.maximum(lo - X, X - hi), 0), axis=1)


def smile(X, e, params):
    """Lifts the corners of the mouth into a slight smile: each point of the front of the muzzle
    moves by lift * a(|x|) * b(y - m(|x|)) * f(z) * c along (0, 1, -back) (a little back as it
    goes up). m is the mouth line of the source, the table `line` ([|x|, y] rows, linear between
    them). a is a smoothstep from 0 at x[0] to 1 at x[1], 1 to x[2], and a smoothstep to 0 at
    x[3], so that the middle of the W stays, the lower curve of each side lifts a little, the
    corner lifts fully, and the cheek fades. b is 1 from -band[1] to band[2] around the line,
    and a smoothstep to 0 at -band[0] below (the chin) and at band[3] above (the pads). f is a
    smoothstep from 0 at z[0] to 1 at z[1], so the back of the head stays. c is a smoothstep from
    0 at noseClear[0] to 1 at noseClear[1] of the distance from the nose box (`noseBox` of the
    params), so the nose stays. The eyeballs stay. Each whisker strip moves as one piece with the
    move of its root (its point nearest the middle plane), so it stays on the muzzle."""
    x0, x1, x2, x3 = e['x']
    lo1, lo0, hi0, hi1 = e['band']
    line = np.array(e['line'], float)
    u = np.abs(X[:, 0])
    dy = X[:, 1] - np.interp(u, line[:, 0], line[:, 1])
    a = smoothstep(x0, x1, u) * (1 - smoothstep(x2, x3, u))
    b = np.where(dy < 0, 1 - smoothstep(lo0, lo1, -dy), 1 - smoothstep(hi0, hi1, dy))
    f = smoothstep(e['z'][0], e['z'][1], X[:, 2])
    c = smoothstep(e['noseClear'][0], e['noseClear'][1], box_distance(X, params['noseBox']))
    w = e['lift'] * a * b * f * c
    D = w[:, None] * np.array([0.0, 1.0, -e['back']])
    part = (params or {}).get('_part')
    if part is not None:
        part = np.asarray(part)
        ball = eye_balls(X, params)
        D[ball != 0] = 0
        for p in np.unique(part[(part >= 0) & (ball == 0)]):
            ids = np.flatnonzero(part == p)
            D[ids] = 0 if e.get('whiskers') == 'stay' else D[ids[np.argmin(u[ids])]]
    return X + D


def arm_even(X, e, params):
    """Moves the left paw of the source in along -x, so that the left arm takes the length of the
    mirror of the right arm (the edit `armEven`, assets/models/fox/README.md, "Even arms"). The
    left forearm of the Tripo mesh is longer by one long quad band before the paw. Each point of the
    left arm (x over `table[0][0]`, y from `y[0]` to `y[1]`) moves by -s(x) along x, with s linear
    between the rows of `table` ([x, s]) and constant past its last row, so the paw moves as one
    piece. The joints of the config (params['_joints']) are places on the mirror of the right arm,
    so they stay."""
    if params.get('_joints'):
        return X
    tab = np.array(e['table'], float)
    on = (X[:, 0] > tab[0, 0]) & (X[:, 1] > e['y'][0]) & (X[:, 1] < e['y'][1])
    Y = X.copy()
    Y[on, 0] -= np.interp(X[on, 0], tab[:, 0], tab[:, 1])
    return Y


def arm_stretch_parts(params, side):
    """The line of the rest arm of a side for the edit `armStretch`: the shoulder joint a, the unit
    direction u from it to the wrist joint, and the length t_w to the wrist joint."""
    m = np.array([1.0 if side == 'L' else -1.0, 1, 1])
    a = np.array(params['sourceJoints']['upper_arm_L']['head'], float) * m
    w = np.array(params['sourceJoints']['hand_L']['head'], float) * m
    t_w = float(np.linalg.norm(w - a))
    return a, (w - a) / t_w, t_w


def arm_stretch_g(t, e, t_w):
    """The place along the arm line after the edit `armStretch`: g(t) = t + (k - 1) G(t), G the
    integral of the band b from 0 to t. b is a smoothstep from 0 at -ramp to 1 at ramp, 1 to the
    wrist, and a smoothstep to 0 from t_w - ramp to t_w + ramp. Thus the upper arm and the forearm
    grow by k, and the paw past the wrist moves as one piece by (k - 1) t_w."""
    r = e['ramp']
    ts = np.linspace(-0.1, 0.6, 7001)
    band = smoothstep(-r, r, ts) * (1 - smoothstep(t_w - r, t_w + r, ts))
    G = np.concatenate([[0], np.cumsum((band[1:] + band[:-1]) / 2 * np.diff(ts))])
    G -= np.interp(0.0, ts, G)
    return t + (e['k'] - 1) * np.interp(t, ts, G)


def arm_stretch(X, e, params):
    """Makes the upper arm and the forearm of each side longer by the factor k (the edit
    `armStretch`, as on the hippo, the panda, the deer, and the badger): each point of the side
    with |x| over the shoulder joint moves along the line of the rest arm u (from the shoulder
    joint to the wrist joint) from its place t on the line to g(t) (arm_stretch_g()). The share
    fades from 1 at the distance reach[0] from the line to 0 at reach[1], so that the belly and the
    head stay. The paw keeps its size and its form."""
    Y = X.copy()
    r0, r1 = e['reach']
    for side, sign in (('L', 1.0), ('R', -1.0)):
        a, u, t_w = arm_stretch_parts(params, side)
        v = X - a
        t = v @ u
        dist = np.linalg.norm(v - np.outer(t, u), axis=1)
        w = (1 - smoothstep(r0, r1, dist)) * (sign * X[:, 0] > a[0] * sign)
        Y += (w * (arm_stretch_g(t, e, t_w) - t))[:, None] * u
    return Y


def arm_source_x(x, params):
    """The x of the source for an x of the left arm after the edit `armStretch`, on the line of
    the rest arm (the inverse of arm_stretch_g()). With no edit, x stays."""
    e = next((e for e in params.get('edits', []) if e['kind'] == 'armStretch'), None)
    if e is None:
        return x
    a, u, t_w = arm_stretch_parts(params, 'L')
    ts = np.linspace(-0.1, 0.6, 7001)
    t = (np.asarray(x, float) - a[0]) / u[0]
    return a[0] + np.interp(t, arm_stretch_g(ts, e, t_w), ts) * u[0]


EDITS = {
    'armEven': arm_even,
    'armStretch': arm_stretch,
    'mouthFill': mouth_fill,
    'headWide': head_wide,
    'legs': legs,
    'shin': shin,
    'head': head,
    'paw': paw,
    'eyes': eyes,
    'armGirth': arm_girth,
    'cheeks': cheeks,
    'muzzle': muzzle,
    'smile': smile,
}


def map_points(X, params, tail=None, part=None):
    """Moves the points X (n x 3, studio axes) by each point edit of the params, in order.
    params['sourceJoints'] holds the joints of the source (make_config.SOURCE)."""
    X = np.asarray(X, float)
    params = dict(params, _tail=tail, _part=part)
    for e in params.get('edits', []):
        X = EDITS[e['kind']](X, e, params)
    return X


def rotation(axis, angle):
    """The matrix of a turn by `angle` radians about the unit `axis` (right hand)."""
    a = np.asarray(axis, float) / np.linalg.norm(axis)
    K = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    return np.eye(3) + np.sin(angle) * K + (1 - np.cos(angle)) * K @ K


def paw_axis(joints, side):
    """The rest forearm axis of a side (from the forearm joint to the wrist joint), outward, and the
    forearm joint, in the studio axes. The right side mirrors the left joints."""
    m = np.array([1.0 if side == 'L' else -1.0, 1, 1])
    f = np.array(joints['forearm_L']['head'], float) * m
    h = np.array(joints['hand_L']['head'], float) * m
    return f, (h - f) / np.linalg.norm(h - f)


def paw_turn_angle(params, side, ring_edges=None):
    """The turn of the paw of a side in radians: whole ring steps of 360 / ring_edges degrees."""
    ring_edges = ring_edges or params.get('ringEdges', 8)
    return np.radians(params.get('pawTurn', {}).get(side, 0) * 360.0 / ring_edges)
