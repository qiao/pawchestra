"""The shared functions of the bodies (design 4.4): the bones and their parents, the
joints of a config, the seated bind, the arm segments, the face colors, the eye shells, the
corrective shapes, the seat, and the GLB writer of a body.

The file has no command line. `rig_mesh_lib()` of `body_armature.py` runs it into a new
namespace for each caller, so that a caller can set `BONES`. `export_rig.py`, `simple_rig.py`,
`body_armature.py`, and `build.py` of each hand chain (`tools/blender/hand/`) use it. The math
uses the axes of the body: y up, +z forward, and +x the left side of the animal
(`to_blender()`). The functions use numpy and the standard library of Python, and no module of
Blender.
"""

import json
import math
import os
import struct

import numpy as np

#: The body bones of a body, in parent order (`BODY_BONES` of
#: `src/models/body-format.ts`, with no eye bones).
BONES = (
    'root',
    'hips',
    'spine',
    'spine1',
    'chest',
    'neck',
    'head',
    'ear_L',
    'ear_R',
    'clavicle_L',
    'upper_arm_L',
    'forearm_L',
    'forearm_twist_L',
    'hand_L',
    'fingers_L',
    'clavicle_R',
    'upper_arm_R',
    'forearm_R',
    'forearm_twist_R',
    'hand_R',
    'fingers_R',
    'thigh_L',
    'shin_L',
    'foot_L',
    'toes_L',
    'thigh_R',
    'shin_R',
    'foot_R',
    'toes_R',
    'tail',
)

#: The optional bone of a tail of two bones (`OPTIONAL_BODY_BONES` of
#: `src/models/body-format.ts`). A config with a joint `tail_tip` adds it after the body bones.
TAIL_TIP = 'tail_tip'

#: The optional bone of a jaw that opens a beak (`OPTIONAL_BODY_BONES` of
#: `src/models/body-format.ts`), a child of the head at the hinge of the beak. A config with a
#: joint `jaw` adds it after the body bones and the tail tip (`config_bones()` of
#: `body_armature.py`).
JAW = 'jaw'

#: The parent of each body bone (`BODY_PARENTS` of `src/models/body-format.ts`).
PARENTS = {
    'root': None,
    'hips': 'root',
    'spine': 'hips',
    'spine1': 'spine',
    'chest': 'spine1',
    'neck': 'chest',
    'head': 'neck',
    'ear_L': 'head',
    'ear_R': 'head',
    'clavicle_L': 'chest',
    'upper_arm_L': 'clavicle_L',
    'forearm_L': 'upper_arm_L',
    'forearm_twist_L': 'forearm_L',
    'hand_L': 'forearm_twist_L',
    'fingers_L': 'hand_L',
    'clavicle_R': 'chest',
    'upper_arm_R': 'clavicle_R',
    'forearm_R': 'upper_arm_R',
    'forearm_twist_R': 'forearm_R',
    'hand_R': 'forearm_twist_R',
    'fingers_R': 'hand_R',
    'thigh_L': 'hips',
    'shin_L': 'thigh_L',
    'foot_L': 'shin_L',
    'toes_L': 'foot_L',
    'thigh_R': 'hips',
    'shin_R': 'thigh_R',
    'foot_R': 'shin_R',
    'toes_R': 'foot_R',
    'tail': 'hips',
    TAIL_TIP: 'tail',
    JAW: 'head',
}

#: The arm bones of each side, from the shoulder out. The clavicle does not move.
ARM = ('upper_arm', 'forearm', 'forearm_twist', 'hand', 'fingers')

#: The arm bones that keep the turn of the upper arm in the bind with `bind.straightArms`
#: (`bind_turns()`), so that the elbow and the wrist of the bind keep the angles of the source.
STRAIGHT_ARM = ('forearm', 'hand')

#: The leg bones of each side, from the hips down.
LEG = ('thigh', 'shin', 'foot', 'toes')

#: The largest number of bones of a vertex (design 4.4).
INFLUENCES = 4

#: The corrective shapes, in their order in the mesh (`tools/body-module.ts`). The clip
#: `reference` gives each one its full weight. The shapes `arm_raise_*` of a body follow them, with
#: the weight 0 in that clip.
SHAPES = ('arm_down_L', 'arm_down_R', 'legs_straight_L', 'legs_straight_R')

#: The largest number of shapes `arm_raise_*` of one body: the shapes of a raised arm or of a bent
#: wrist (`BODY_RAISES` of `src/models/body-format.ts`).
RAISE_LIMIT = 4

#: The roughness of each material, as the materials of the rabbit.
MATERIALS = (('fur', 0.7), ('gloss', 0.42))


def log(text):
    """Prints a line of the log, which starts with `rig_mesh:`."""
    print(f'rig_mesh: {text}', flush=True)


def to_blender(v):
    """Converts points from the axes of the body (y up, z forward) to the axes of Blender."""
    v = np.asarray(v, float)
    return np.stack([v[..., 0], -v[..., 2], v[..., 1]], axis=-1)


def unit(v):
    """Gives a vector of length 1 in the direction of a vector."""
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


def smoothstep(x, low, high):
    """Gives 0 below `low`, 1 above `high`, and a smooth ramp between them, for arrays."""
    t = np.clip((np.asarray(x, float) - low) / (high - low), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def quat_matrix(q):
    """Gives the rotation matrix of a quaternion (x, y, z, w)."""
    x, y, z, w = unit(q)
    return np.array(
        [
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
        ]
    )


def matrix_quat(m):
    """Gives the quaternion (x, y, z, w) of a rotation matrix, with w >= 0."""
    t = np.trace(m)
    if t > 0:
        s = math.sqrt(t + 1.0) * 2
        q = [(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, 0.25 * s]
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = math.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
        q = [0.25 * s, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s, (m[2, 1] - m[1, 2]) / s]
    elif m[1, 1] > m[2, 2]:
        s = math.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
        q = [(m[0, 1] + m[1, 0]) / s, 0.25 * s, (m[1, 2] + m[2, 1]) / s, (m[0, 2] - m[2, 0]) / s]
    else:
        s = math.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
        q = [(m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, 0.25 * s, (m[1, 0] - m[0, 1]) / s]
    q = unit(q)
    return q if q[3] >= 0 else -q


def swing(a, b):
    """Gives the smallest rotation matrix that turns the unit vector `a` onto the unit vector
    `b`."""
    a, b = unit(a), unit(b)
    axis = np.cross(a, b)
    s = np.linalg.norm(axis)
    c = float(np.dot(a, b))
    if s < 1e-9:
        return np.eye(3)
    k = axis / s
    kx = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + s * kx + (1 - c) * kx @ kx


def mirror_name(name):
    """Gives the name of the bone on the other side, or the name of a bone of the middle."""
    if name.endswith('_L'):
        return name[:-2] + '_R'
    if name.endswith('_R'):
        return name[:-2] + '_L'
    return name


def mirrored(v):
    """Mirrors a point or a direction to the other side of the middle plane."""
    return np.array([-v[0], v[1], v[2]], float)


def linear(srgb):
    """Converts sRGB values from 0 to 1 to linear values."""
    srgb = np.asarray(srgb, float)
    return np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)


def sample_grid(n):
    """Gives the barycentric weights of the texture samples of a face: a grid of `n` steps."""
    return np.array(
        [(i / n, j / n, (n - i - j) / n) for i in range(n + 1) for j in range(n + 1 - i)]
    )


def face_samples(uv, grid, texture):
    """Gives the sRGB texture samples of one face at the weights of `grid` (`sample_grid()`)."""
    height, width, _ = texture.shape
    at = grid @ uv
    x = np.clip(((at[:, 0] % 1.0) * width).astype(int), 0, width - 1)
    y = np.clip(((at[:, 1] % 1.0) * height).astype(int), 0, height - 1)
    return texture[y, x]


def luminance(samples):
    """Gives the linear luminance of sRGB samples."""
    return linear(samples) @ [0.2126, 0.7152, 0.0722]


def oklab(srgb):
    """Converts sRGB colors from 0 to 1 to Oklab (Björn Ottosson, 2020)."""
    rgb = linear(srgb)
    lms = (
        rgb
        @ np.array(
            [
                [0.4122214708, 0.5363325363, 0.0514459929],
                [0.2119034982, 0.6806995451, 0.1073969566],
                [0.0883024619, 0.2817188376, 0.6299787005],
            ]
        ).T
    )
    return (
        np.cbrt(lms)
        @ np.array(
            [
                [0.2104542553, 0.7936177850, -0.0040720468],
                [1.9779984951, -2.4285922050, 0.4505937099],
                [0.0259040371, 0.7827717662, -0.8086757660],
            ]
        ).T
    )


def srgb_of_oklab(lab):
    """Converts Oklab colors back to sRGB colors from 0 to 1."""
    lms = (
        lab
        @ np.array(
            [
                [1.0, 0.3963377774, 0.2158037573],
                [1.0, -0.1055613458, -0.0638541728],
                [1.0, -0.0894841775, -1.2914855480],
            ]
        ).T
    )
    rgb = (lms**3) @ np.array(
        [
            [4.0767416621, -3.3077115913, 0.2309699292],
            [-1.2684380046, 2.6097574011, -0.3413193965],
            [-0.0041960863, -0.7034186147, 1.7076147010],
        ]
    ).T
    rgb = np.clip(rgb, 0.0, 1.0)
    return np.where(rgb <= 0.0031308, rgb * 12.92, 1.055 * rgb ** (1 / 2.4) - 0.055)


def palette(colors, size, rounds=40):
    """Gives each face a color of a palette of at most `size` colors: k-means in Oklab, a uniform
    color space, so that a step of the palette looks the same in each hue. The first centers are
    the farthest colors from each other, so that the small features (the eyes, the nose, the
    inner ears, the whiskers) get centers of their own. Gives the new sRGB colors and the largest
    and the mean Oklab distance of a face from its palette color."""
    lab = oklab(colors)
    centers = [lab[int(np.argmin(np.linalg.norm(lab - lab.mean(axis=0), axis=1)))]]
    near = np.linalg.norm(lab - centers[0], axis=1)
    while len(centers) < min(size, len(lab)):
        centers.append(lab[int(np.argmax(near))])
        near = np.minimum(near, np.linalg.norm(lab - centers[-1], axis=1))
    centers = np.array(centers)
    for _ in range(rounds):
        label = np.argmin(np.linalg.norm(lab[:, None] - centers[None], axis=2), axis=1)
        for k in range(len(centers)):
            if (label == k).any():
                centers[k] = lab[label == k].mean(axis=0)
    label = np.argmin(np.linalg.norm(lab[:, None] - centers[None], axis=2), axis=1)
    error = np.linalg.norm(lab - centers[label], axis=1)
    return srgb_of_oklab(centers)[label], float(error.max()), float(error.mean())


def tone(colors, main_bone, rule):
    """Moves the faces of the plain fur in Oklab (`colors.tone` of the config), so that a fur
    that the warm stage light colors keeps the look of its sheet. A face takes the move when its
    Oklab chroma is at most `chroma`, its lightness is below `light` (the move fades to 0 over
    the range), and its main bone is not one of `keep`: the pink nose and inner ears have more
    chroma, and the white paws and whiskers keep their colors. The move (lightness, a, b) is the
    linear blend of the rows of `points` by the lightness of the face, as [L, dL, da, db], and
    the move of the first or the last row outside them. Gives the new colors and the count of
    the moved faces."""
    lab = oklab(colors)
    points = np.asarray(rule['points'], float)
    keep = [BONES.index(b) for b in BONES if b.rsplit('_', 1)[0] in rule['keep']]
    chroma = np.hypot(lab[:, 1], lab[:, 2])
    share = ((chroma <= rule['chroma']) & ~np.isin(main_bone, keep)) * (
        1.0 - smoothstep(lab[:, 0], *rule['light'])
    )
    for k in range(3):
        lab[:, k] += share * np.interp(lab[:, 0], points[:, 0], points[:, k + 1])
    return srgb_of_oklab(lab), int((share > 0).sum())


def in_box(points, box):
    """Tells for each point if it is in a box of two corners."""
    lo, hi = np.asarray(box[0]), np.asarray(box[1])
    return np.all((points >= lo) & (points <= hi), axis=1)


def features(verts, tris, colors, dark, rules):
    """Finds the faces of the eyes, by side, and the faces of the nose."""
    centers = verts[tris].mean(axis=1)
    box = np.asarray(rules['eyeBox'], float)
    left = dark & in_box(centers, box)
    right_box = [[-box[1][0], box[0][1], box[0][2]], [-box[0][0], box[1][1], box[1][2]]]
    right = dark & in_box(centers, right_box)
    # The export takes each gloss shell out of the middle plane as an eye, so the two nostrils of
    # the hippo would be eyes: a mesh with no nose on the middle plane has no nose box.
    nose = np.zeros(len(tris), bool)
    if 'noseBox' in rules:
        nose_color = np.asarray(rules['nose'], float)
        pink = np.linalg.norm(colors - nose_color, axis=1) < np.linalg.norm(colors - 1.0, axis=1)
        nose = pink & in_box(centers, rules['noseBox'])
    log(f'eyes: {left.sum()} faces left, {right.sum()} faces right, nose: {nose.sum()} faces')
    return {'L': np.nonzero(left)[0], 'R': np.nonzero(right)[0]}, np.nonzero(nose)[0]


def joints_of(config):
    """Gives the head, the tail, the roll hint, and the child at the tail (or `None` for a tail
    at a point of its own) of each body bone, in the pose of the source. The right side mirrors
    the left side of the config."""
    joints = config['joints']
    palm = unit(config['palm'])
    heads, ends, rolls, children = {}, {}, {}, {}
    specs = {}
    for name in BONES:
        own = name in joints
        spec = joints[name] if own else joints[mirror_name(name)]
        side = (lambda v: np.asarray(v, float)) if own else mirrored
        specs[name] = (spec, own, side)
        heads[name] = side(spec['head'])
        roll = spec.get('roll', [0, 0, 1])
        rolls[name] = side(palm if roll == 'palm' else roll)
    for name in BONES:
        spec, own, side = specs[name]
        tail = spec['tail']
        if isinstance(tail, str):
            children[name] = tail if own else mirror_name(tail)
            ends[name] = heads[children[name]]
        else:
            children[name] = None
            ends[name] = side(tail)
    return heads, ends, rolls, children


#: The number of deform segments of each upper arm and each forearm with `armSegments` of the
#: config (`ARM_SEGMENTS` of `src/models/body-rig.ts`).
ARM_SEGMENTS = 4


def segment_bones():
    """Gives the names of the arm segments and of the elbow and wrist helpers, the left side first
    (`ARM_SEGMENT_BONES` of `src/models/body-format.ts`). Each segment of a part is a deform bone
    along the part, and each helper starts at its joint."""
    out = []
    for side in 'LR':
        out += [f'upper_arm_seg{k}_{side}' for k in range(ARM_SEGMENTS)]
        out += [f'forearm_seg{k}_{side}' for k in range(ARM_SEGMENTS)]
        out += [f'elbow_{side}', f'wrist_{side}']
    return tuple(out)


def segment_parents():
    """Gives the parent of each arm segment and helper: the upper arm, the forearm, or, for the
    wrist helper, the forearm twist bone (`BODY_PARENTS` of `src/models/body-format.ts`)."""
    out = {}
    for side in 'LR':
        for k in range(ARM_SEGMENTS):
            out[f'upper_arm_seg{k}_{side}'] = f'upper_arm_{side}'
            out[f'forearm_seg{k}_{side}'] = f'forearm_{side}'
        out[f'elbow_{side}'] = f'upper_arm_{side}'
        out[f'wrist_{side}'] = f'forearm_twist_{side}'
    return out


def segment_share(k):
    """Gives the share of the twist that the segment k of an arm part takes: the middle of the
    segment, from 0 at the start of the part to 1 at its end."""
    return (k + 0.5) / ARM_SEGMENTS


def segment_joints(heads, ends, rolls, children, rule):
    """Adds the heads, the tails, the roll hints, and the children of the arm segments and of the
    helpers (`armSegments` of the config). The segments split the upper arm and the forearm into
    equal parts. Each helper starts at its joint and points along the bone after the joint, with
    the length `rule['helper']` in units."""
    for side in 'LR':
        s, e, w = (heads[f'{b}_{side}'] for b in ('upper_arm', 'forearm', 'hand'))
        for part, a, b in (('upper_arm', s, e), ('forearm', e, w)):
            for k in range(ARM_SEGMENTS):
                name = f'{part}_seg{k}_{side}'
                heads[name] = a + (b - a) * k / ARM_SEGMENTS
                ends[name] = a + (b - a) * (k + 1) / ARM_SEGMENTS
                rolls[name] = rolls[f'{part}_{side}']
                children[name] = None
        for name, joint, toward, roll in (
            (f'elbow_{side}', e, w, f'forearm_{side}'),
            (f'wrist_{side}', w, ends[f'hand_{side}'], f'hand_{side}'),
        ):
            heads[name] = joint.copy()
            ends[name] = joint + unit(toward - joint) * rule['helper']
            rolls[name] = rolls[roll]
            children[name] = None


def twist_of(m, axis):
    """Gives the angle of the twist of a rotation matrix around a unit axis (the swing and twist
    split), from -pi to pi, as `twistAngle()` of `src/models/body-rig.ts`."""
    x, y, z, w = matrix_quat(m)
    angle = 2 * np.arctan2(np.array([x, y, z]) @ axis, w)
    return float((angle + np.pi) % (2 * np.pi) - np.pi)


def axis_turn(axis, angle):
    """Gives the rotation matrix of a turn by `angle` radians around a unit axis."""
    half = angle / 2
    return quat_matrix([*(np.sin(half) * np.asarray(axis)), np.cos(half)])


def half_turn(a, b):
    """Gives the rotation halfway from the rotation matrix `a` to `b` (a slerp at 0.5)."""
    qa, qb = np.asarray(matrix_quat(a)), np.asarray(matrix_quat(b))
    if qa @ qb < 0:
        qb = -qb
    return quat_matrix(qa + qb)


def driven_turns(turns, heads):
    """Gives the world turns of the arm segments and of the helpers from the world turns of the
    body bones, as `poseArm()` of `src/models/body-rig.ts` drives them. `heads` holds the joints
    of the pose from which the turns start. Each upper arm segment takes its share of the roll of
    the upper arm from the chest, and each forearm segment its share of the twist from the forearm
    to the paw (`segment_share()`). The elbow helper turns halfway from the upper arm to the
    forearm, and the wrist helper halfway from the forearm with all of the twist to the paw."""
    out = {}
    chest = turns['chest']
    for side in 'LR':
        upper, fore, hand = (turns[f'{b}_{side}'] for b in ('upper_arm', 'forearm', 'hand'))
        rest = unit(heads[f'forearm_{side}'] - heads[f'upper_arm_{side}'])
        roll = twist_of((swing(chest @ rest, upper @ rest) @ chest).T @ upper, rest)
        along = unit(heads[f'hand_{side}'] - heads[f'forearm_{side}'])
        twist = twist_of(fore.T @ hand, along)
        for k in range(ARM_SEGMENTS):
            share = segment_share(k)
            out[f'upper_arm_seg{k}_{side}'] = upper @ axis_turn(rest, (share - 1) * roll)
            out[f'forearm_seg{k}_{side}'] = fore @ axis_turn(along, share * twist)
        out[f'elbow_{side}'] = half_turn(upper, fore)
        out[f'wrist_{side}'] = half_turn(fore @ axis_turn(along, twist), hand)
    return out


def arm_bones(side):
    """Gives the arm bones of one side that move the arm vertices: the bones of `ARM`, and the arm
    segments and helpers of a rig with `armSegments`."""
    return [f'{b}_{side}' for b in ARM] + [
        b for b in BONES if b.endswith('_' + side) and (b in SEGMENT_PARENTS or b in DIGIT_PARENTS)
    ]


def digit_bones():
    """Gives the names of the digit bones of a hand rig, the left side first
    (`DIGIT_BONES` of `src/models/body-format.ts`): one bone for each claw, from `digit1` at the
    thumb side to `digit5`, each a child of the fingers of its side."""
    return tuple(f'digit{k}_{side}' for side in 'LR' for k in range(1, 6))


#: The parent of each arm segment and helper.
SEGMENT_PARENTS = segment_parents()
PARENTS.update(SEGMENT_PARENTS)

#: The parent of each digit bone: the fingers of its side.
DIGIT_PARENTS = {name: f'fingers_{name[-1]}' for name in digit_bones()}
PARENTS.update(DIGIT_PARENTS)

#: The optional thumb bones of a paw that is one fist with a free thumb (`THUMB_BONES` of
#: `src/models/body-format.ts`), each a child of the paw of its side, after all other bones.
THUMB_BONES = ('thumb_L', 'thumb_R')
PARENTS.update({name: f'hand_{name[-1]}' for name in THUMB_BONES})


def taubin(points, tris, ids, share, rounds):
    """Smooths the vertices `ids` by the method of Taubin (1995): in each round, each vertex moves
    a half of the way to the middle of its neighbors, then 0.53 of the way back, so that a tube
    keeps its width. Each vertex moves by its `share`, so that the edge of the region keeps its
    neighbors. Gives the smoothed points."""
    neighbors = [set() for _ in range(len(points))]
    for a, b, c in tris:
        neighbors[a].update((b, c))
        neighbors[b].update((a, c))
        neighbors[c].update((a, b))
    rings = [np.array(sorted(neighbors[i])) for i in ids]
    out = points.copy()
    for _ in range(rounds):
        for factor in (0.5, -0.53):
            mids = np.array([out[r].mean(axis=0) for r in rings])
            out[ids] += (factor * share)[:, None] * (mids - out[ids])
    return out


#: The bones that turn with each trunk bone of the shares of `bind.trunk`: the clavicles with
#: the chest, and the ears with the head.
TRUNK_FOLLOWERS = {
    'clavicle_L': 'chest',
    'clavicle_R': 'chest',
    'ear_L': 'head',
    'ear_R': 'head',
    JAW: 'head',
}


def recline(angle):
    """Gives the turn around the x axis that moves the top of a trunk back by `angle` degrees: the
    up direction goes toward -z, the back of the body axes."""
    a = np.radians(angle)
    return np.array([[1, 0, 0], [0, np.cos(a), np.sin(a)], [0, -np.sin(a), np.cos(a)]])


def hip_angle(heads):
    """Gives the hip angle from the side, in degrees: the angle between the trunk axis from the
    middle of the hip joints to the neck joint and the thigh axis from the left hip joint to the
    left knee joint."""
    hip = (heads['thigh_L'] + heads['thigh_R']) / 2
    trunk = (heads['neck'] - hip)[[2, 1]]
    thigh = (heads['shin_L'] - heads['thigh_L'])[[2, 1]]
    cos = trunk @ thigh / np.linalg.norm(trunk) / np.linalg.norm(thigh)
    return float(np.degrees(np.arccos(np.clip(cos, -1.0, 1.0))))


def trunk_turn(config, heads, ends, rolls):
    """Finds the recline of the seated bind pose (`bind.trunk`): the turn of the pelvis, in
    degrees, that opens the hip angle (`hip_angle()`) by `open` degrees. A negative `open` closes
    the hip angle, so the trunk leans forward, as for the standing monkey, which brings its center
    of mass over its feet. Each trunk bone takes its share of the turn as its world turn, so that
    the counter turn of the upper trunk keeps the head about level. Gives 0 with no rule."""
    rule = config['bind'].get('trunk')
    if not rule or rule['open'] == 0:
        return 0.0
    upright = hip_angle(posed_heads(heads, bind_turns(config, heads, ends, rolls)))
    low, high = 0.0, 3.0 * rule['open']
    for _ in range(50):
        mid = (low + high) / 2
        turns = bind_turns(config, heads, ends, rolls, mid)
        if (hip_angle(posed_heads(heads, turns)) - upright < rule['open']) == (rule['open'] > 0):
            low = mid
        else:
            high = mid
    return (low + high) / 2


def bind_turns(config, heads, ends, rolls, turn=0.0):
    """Gives the world turn of each bone from the pose of the source to the seated bind pose. The
    legs take the inverse of the turns of the body from its bind pose to its clip `reference`.
    With a recline (`turn` degrees, `trunk_turn()`), each trunk bone of the shares of
    `bind.trunk` takes its share of it (`recline()`), the clavicles turn with the chest, and the
    ears with the head. Each arm bone turns the least way onto its bind direction after the turn
    of its parent, so that the arm does not twist. With `bind.straightArms`, the forearm and the
    paw keep the turn of the upper arm, so that the elbow and the wrist keep the angles of the
    source (`bind_hinges()`). With `bindSupination`, the paw of a side then turns about its bind
    forearm toward supination by its angle in degrees, and the fingers turn with it
    (`paw_supination()`). The bones of a tail of two bones turn so onto the directions of
    `tailBind`. With a recline, the tip of the tail turns until its end is at the height of the
    upright bind. The other bones do not turn."""
    body = config['bind']
    turns = {name: np.eye(3) for name in BONES}
    rule = body.get('trunk')
    if rule and turn:
        for name, share in rule['shares'].items():
            turns[name] = recline(turn * share)
        for name, leader in TRUNK_FOLLOWERS.items():
            if name in turns:
                turns[name] = turns[leader]
    for side in 'LR':
        for bone in LEG:
            q = np.asarray(body['legTurns'][bone], float)
            if side == 'R':
                q = q * [1, -1, -1, 1]
            turns[f'{bone}_{side}'] = quat_matrix(q).T
        parent = turns[f'clavicle_{side}']
        for bone in ARM:
            name = f'{bone}_{side}'
            if bone in ('forearm_twist', 'fingers'):
                # The twist bone and the fingers keep the turn of their parent.
                turns[name] = parent
                continue
            if bone in STRAIGHT_ARM and body.get('straightArms', False):
                turns[name] = parent
            else:
                target = np.asarray(body['bindArms'][bone], float)
                if side == 'R':
                    target = mirrored(target)
                now = parent @ unit(ends[name] - heads[name])
                turns[name] = swing(now, target) @ parent
            if bone == 'hand':
                turns[name] = paw_supination(body, side, turns, heads) @ turns[name]
            parent = turns[name]
    if TAIL_TIP in BONES:
        # Each tail bone turns the least way onto its bind direction after the turn of its parent.
        parent = np.eye(3)
        targets = body['tailBind']
        for name in ('tail', TAIL_TIP):
            now = parent @ unit(ends[name] - heads[name])
            turns[name] = swing(now, np.asarray(targets[name], float)) @ parent
            parent = turns[name]
        if rule and turn:
            # A recline moves the root of the tail down with the pelvis, and the root keeps its
            # direction, so that its underside lies on the seat. The tip turns up
            # or down in its vertical plane until its end is at the height of the end of the tail
            # of the upright bind, so that it hangs behind the chair as with no recline.
            straight = bind_turns(config, heads, ends, rolls)
            tip = ends[TAIL_TIP] - heads[TAIL_TIP]
            end = posed_heads(heads, straight)[TAIL_TIP] + straight[TAIL_TIP] @ tip
            head = posed_heads(heads, turns)[TAIL_TIP]
            now = turns[TAIL_TIP] @ unit(tip)
            rise = float(np.clip((end[1] - head[1]) / np.linalg.norm(tip), -1.0, 1.0))
            flat = unit(np.array([now[0], 0.0, now[2]]))
            target = flat * np.sqrt(1.0 - rise * rise) + np.array([0.0, rise, 0.0])
            turns[TAIL_TIP] = swing(now, target) @ turns[TAIL_TIP]
    if 'armSegments' in config:
        # The arm segments and the helpers turn by the rules of the app.
        turns.update(driven_turns(turns, heads))
    return turns


def paw_supination(body, side, turns, heads):
    """Gives the turn of the bind paw of one side about its bind forearm, from the elbow to the
    wrist, toward supination by the angle of the side in `bindSupination` (degrees, 0 with no
    value). The forearm of the app turns with its elbow hinge, so the bind paw sets the zero of
    the paw twist (`poseArm()` of `src/models/body-rig.ts`): this turn moves the zero toward
    supination by the angle, and the forearm segments share it in the bind (`driven_turns()`).
    The body axes have the left side at +x, so the left paw supinates by a negative turn
    about its forearm, and the right paw by a positive turn."""
    angle = body.get('bindSupination', {}).get(side, 0)
    if not angle:
        return np.eye(3)
    along = turns[f'forearm_{side}'] @ unit(heads[f'hand_{side}'] - heads[f'forearm_{side}'])
    return axis_turn(along, np.radians(angle) * (-1 if side == 'L' else 1))


def bind_hinges(config, turns, heads, ends):
    """Gives the unit elbow axis of each arm in the bind pose for a config with
    `bind.straightArms`, or `None` with no such rule. The app turns each elbow about this axis
    (`Body.hinges`, `poseArm()` of `src/models/body-rig.ts`). A straight bind arm has no
    plane of its own, so the axis is the axis of the bent bind of `bind.bindArms`: the bind
    upper arm × the bind forearm direction of the config. Thus the upper arm and the paw take the
    same world turns in each pose as with the bent bind. The forearm differs by the angle of the
    source forearm out of the plane of the bent bind."""
    body = config['bind']
    if not body.get('straightArms', False):
        return None
    out = {}
    for side in 'LR':
        name = f'upper_arm_{side}'
        upper = turns[name] @ unit(ends[name] - heads[name])
        fore = np.asarray(body['bindArms']['forearm'], float)
        if side == 'R':
            fore = mirrored(fore)
        out[side] = unit(np.cross(upper, unit(fore)))
    return out


def posed_heads(heads, turns):
    """Gives the head of each bone after the world turns, from the root down."""
    out = {}
    for name in BONES:
        parent = PARENTS[name]
        if parent is None:
            out[name] = heads[name].copy()
        else:
            out[name] = out[parent] + turns[parent] @ (heads[name] - heads[parent])
    return out


def seat_masks(points, weights, chair):
    """Gives the masks of the seat of a seated body: the vertices
    over the seat, the vertices of the shins and the feet that hang in front of it, and the
    vertices of the tail. Gives also the share of each vertex on these hanging bones and on the
    tail and arm bones."""
    hw, front, back = chair['halfWidth'], chair['front'], chair['back']
    lower = [BONES.index(f'{b}_{s}') for b in ('shin', 'foot', 'toes') for s in 'LR']
    tails = [BONES.index(b) for b in ('tail', TAIL_TIP) if b in BONES]
    arms = [BONES.index(n) for s in 'LR' for n in arm_bones(s)]
    hanging = weights[:, lower].sum(axis=1)
    tail = weights[:, tails].sum(axis=1)
    free = hanging + tail + weights[:, arms].sum(axis=1)
    seat = (np.abs(points[:, 0]) <= hw) & (points[:, 2] >= back) & (points[:, 2] <= front)
    return seat, hanging > 0.5, tail > 0.5, np.clip(free, 0.0, 1.0)


def boundary_loop(tris):
    """Gives the longest closed loop of the open edges of a patch of faces, in the order of the
    faces (counterclockwise from outside for faces in that order). Two parts of a patch can touch
    at one corner, with two open edges out of it, as the left eye of the fox does. The loop then
    goes around both parts and passes that corner two times: each loop is a walk that uses each
    open edge of its part one time (the algorithm of Hierholzer)."""
    count = {}
    for t in tris:
        for k in range(3):
            edge = (int(t[k]), int(t[(k + 1) % 3]))
            count[edge] = count.get(edge, 0) + 1
    outs = {}
    for a, b in sorted(count):
        if (b, a) not in count:
            outs.setdefault(a, []).append(b)
    loops, used = [], set()
    for start in sorted(outs):
        if all((start, b) in used for b in outs[start]):
            continue
        stack, walk = [start], []
        while stack:
            v = stack[-1]
            free = [b for b in outs.get(v, []) if (v, b) not in used]
            if free:
                used.add((v, free[0]))
                stack.append(free[0])
            else:
                walk.append(stack.pop())
        walk.reverse()
        if len(walk) > 1 and walk[0] == walk[-1]:
            loops.append(walk[:-1])
    return max(loops, key=len) if loops else []


def fan_gap(points, fan, inside, normal):
    """Gives the largest height of a point above a fan of triangles, along a normal: the lift
    that puts each point under the fan. A point counts for the triangle that holds it when both
    are seen along the normal."""
    gap = 0.0
    for a, b, c in fan:
        pa, pb, pc = points[a], points[b], points[c]
        face = np.cross(pb - pa, pc - pa)
        if abs(face.dot(normal)) < 1e-12:
            continue
        for p in inside:
            # The point where the line through p along the normal meets the plane of the face.
            t = (pa - p).dot(face) / normal.dot(face)
            q = p + t * normal
            u = np.cross(pb - pa, q - pa).dot(face)
            v = np.cross(pc - pb, q - pb).dot(face)
            w = np.cross(pa - pc, q - pc).dot(face)
            if (u >= 0 and v >= 0 and w >= 0) or (u <= 0 and v <= 0 and w <= 0):
                gap = max(gap, -t)
    return gap


def old_eye_faces(points, tris, faces, loop, normal, rule):
    """Finds the faces of the old eye of one side: the dark faces of the eye, and each face whose
    middle lies within `reach` times the radius of the edge of the dark faces from the middle of
    the edge, seen along the normal of the eye, such as the white of the almond eye of the fox and
    the brown lid shading under its right eye. A face counts only within half the radius from the
    plane of the edge, so that the back of the head does not count."""
    ring = points[loop]
    center = ring.mean(axis=0)
    radius = np.linalg.norm(np.cross(ring - center, normal), axis=1).max()
    mids = points[tris].mean(axis=1) - center
    across = np.linalg.norm(np.cross(mids, normal), axis=1)
    near = (across <= rule['reach'] * radius) & (np.abs(mids @ normal) <= 0.5 * radius)
    return np.union1d(faces, np.nonzero(near)[0])


def dark_faces_near(points, tris, dark, taken, loop, normal, rule):
    """Finds the dark faces near the old eye of one side that no old eye holds, such as the end of
    the black upper lid line of the almond eye of the fox above its inner corner: each dark face
    whose middle lies within `darkReach` times the radius of the edge of the
    dark faces of the eye from the middle of the edge, seen along the normal of the eye, and within
    half that radius of the plane of the edge. The faces in `taken` do not count. Gives the faces
    in patches: the faces of a patch share corners, and the faces of two patches share none."""
    ring = points[loop]
    center = ring.mean(axis=0)
    radius = np.linalg.norm(np.cross(ring - center, normal), axis=1).max()
    mids = points[tris].mean(axis=1) - center
    across = np.linalg.norm(np.cross(mids, normal), axis=1)
    near = dark & (across <= rule['darkReach'] * radius) & (np.abs(mids @ normal) <= 0.5 * radius)
    near[np.asarray(list(taken), int)] = False
    return corner_patches(tris, np.nonzero(near)[0])


def corner_patches(tris, faces):
    """Splits faces into patches: the faces of a patch share corners, and the faces of two patches
    share none. Gives the faces of each patch, in the order in which its last face comes."""
    patches = []
    for f in faces:
        corners = set(int(c) for c in tris[f])
        joined = [p for p in patches if corners & p[1]]
        members = [int(f)] + [g for p in joined for g in p[0]]
        corners |= set(c for p in joined for c in p[1])
        patches = [p for p in patches if p not in joined] + [(members, corners)]
    return [np.array(sorted(members)) for members, _ in patches]


def recolor_old_eyes(colors, tris, points, old):
    """Gives each face of an old eye, or of a patch of dark faces near it (`dark_faces_near()`),
    the color of the fur around it, so that no outline of the old eye shows around the bead eye of
    the app (design 4.5): the color with the largest area in the ring of faces that share a corner
    with the faces. A single color keeps the lid shading of the ring, such as the brown faces above
    the right eye of the fox, out of the old eye. Gives the new colors and the share of the area of
    the ring that has the color."""
    inside = set(int(f) for f in old)
    corners = set(int(c) for f in old for c in tris[f])
    ring = [f for f, t in enumerate(tris) if f not in inside and any(int(c) in corners for c in t)]
    a, b, c = points[tris[ring, 0]], points[tris[ring, 1]], points[tris[ring, 2]]
    areas = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
    totals = {}
    for f, area in zip(ring, areas):
        key = tuple(colors[f])
        totals[key] = totals.get(key, 0.0) + float(area)
    color = max(totals, key=lambda key: (totals[key], key))
    out = colors.copy()
    out[old] = color
    return out, totals[color] / sum(totals.values())


def add_eye_shells(verts, bind, tris, colors, dark, eyes, rule):
    """Adds a gloss shell over each eye: a fan from the middle of the eye to at most `points`
    points of the edge of the dark faces, lifted along the normal of the eye in the bind mesh. The
    fan needs fewer faces than a copy of the faces of the eye. The faces under it take the mean
    fur color of their neighbors, as an input of the palette. `pnpm body-module` finds the eye by
    its fan, drops the fan, and the app puts the bead eye at its place (design 4.5). Gives the new
    vertices of the source and of the bind mesh, the triangles, the colors, the materials, the
    faces of each old eye (`old_eye_faces()`), and the patches of the dark faces near each old eye
    (`dark_faces_near()`)."""
    lift, points = rule['lift'], rule['points']
    material = np.array(['fur'] * len(tris), dtype=object)
    new_src, new_bind, new_tris, new_colors = [verts], [bind], [tris], [colors.copy()]
    count = len(verts)
    eye_faces = np.concatenate([eyes['L'], eyes['R']])
    old, edges, near = {}, {}, {}
    neighbors = {}
    for f, t in enumerate(tris):
        for k in range(3):
            edge = tuple(sorted((t[k], t[(k + 1) % 3])))
            neighbors.setdefault(edge, []).append(f)
    for side in 'LR':
        faces = eyes[side]
        if len(faces) == 0:
            continue
        loop = boundary_loop(tris[faces])
        if len(loop) < 3:
            raise SystemExit(f'The eye {side} has no closed edge.')
        n = min(points, len(loop))
        ring = [loop[k * len(loop) // n] for k in range(n)]
        normal = np.zeros(3)
        for f in faces:
            a, b, c = bind[tris[f]]
            normal += np.cross(b - a, c - a)
        normal = unit(normal)
        corners = np.unique(tris[faces])
        old[side] = old_eye_faces(bind, tris, faces, loop, normal, rule)
        edges[side] = (loop, normal)
        fan = [[0, 1 + k, 1 + (k + 1) % n] for k in range(n)]
        for target, place in ((new_src, verts), (new_bind, bind)):
            # The eye bulges, so the middle of the fan goes to the top of the dark faces, and the
            # fan rises until each corner of the dark faces lies under it.
            middle = place[corners].mean(axis=0)
            middle += normal * (place[corners] - middle).dot(normal).max()
            shell = np.vstack([middle, place[ring]])
            gap = fan_gap(shell, fan, place[corners], normal)
            target.append(shell + (lift + gap) * normal)
        new_tris.append(
            np.array([[count, count + 1 + k, count + 1 + (k + 1) % n] for k in range(n)])
        )
        new_colors.append(np.tile(colors[faces].mean(axis=0), (n, 1)))
        count += n + 1
        log(
            f'eye {side}: {len(faces)} dark faces, an edge of {len(loop)} points, a fan of {n} '
            f'faces, {gap + lift:.4f} u over the eye, {len(old[side])} faces of the old eye'
        )
        # The faces under the shell take the mean color of the fur faces around the eye.
        around = set()
        for f in faces:
            t = tris[f]
            for k in range(3):
                around.update(neighbors[tuple(sorted((t[k], t[(k + 1) % 3])))])
        around -= set(eye_faces.tolist())
        fur = colors[sorted(around)].mean(axis=0) if around else colors[faces].mean(axis=0)
        new_colors[0][faces] = fur
    taken = set(int(f) for faces in old.values() for f in faces)
    for side, (loop, normal) in edges.items():
        near[side] = dark_faces_near(bind, tris, dark, taken, loop, normal, rule)
        taken |= set(int(f) for patch in near[side] for f in patch)
    tris_out = np.concatenate(new_tris)
    material = np.concatenate(
        [material, np.array(['gloss'] * (len(tris_out) - len(tris)), dtype=object)]
    )
    return (
        np.concatenate(new_src),
        np.concatenate(new_bind),
        tris_out,
        np.concatenate(new_colors),
        material,
        old,
        near,
    )


def correctives(src, bind, weights, turns, src_heads, bind_heads):
    """Finds the move of each vertex in the bind pose that the skin of the clip `reference` takes
    to its source place: d = A⁻¹ (source − b) − bind, with the skin A p + b of the clip. Gives the
    moves, the smallest determinant of A, and the vertex of it. `turns` holds the world turn of
    each bone from the bind pose to the source (`clip_turns()`)."""
    a = np.zeros((len(src), 3, 3))
    b = np.zeros((len(src), 3))
    for k, name in enumerate(BONES):
        w = weights[:, k]
        if not w.any():
            continue
        back = turns[name]
        a += w[:, None, None] * back
        b += w[:, None] * (src_heads[name] - back @ bind_heads[name])
    det = np.linalg.det(a)
    worst = int(np.argmin(np.abs(det)))
    moves = np.linalg.solve(a, (src - b)[:, :, None])[:, :, 0] - bind
    return moves, float(det[worst]), worst


def clip_turns(turns, bind_heads):
    """Gives the world turn of each bone from the seated bind pose to the source (the clip
    `reference`): the inverse of each bind turn. The arm segments and the helpers turn from the
    turns of the body bones by the rules of the app (`driven_turns()`)."""
    out = {name: turns[name].T for name in BONES}
    if any(name in SEGMENT_PARENTS for name in BONES):
        out.update(driven_turns(out, bind_heads))
    return out


def split_shapes(moves, weights, bind):
    """Splits the corrective moves into the four shapes: the vertices with an arm weight give the
    arm shapes, and the others give the leg shapes. Each kind splits by side with a smooth ramp
    across the middle plane, as the body does."""
    arm = np.zeros(len(moves), bool)
    for side in 'LR':
        for name in arm_bones(side):
            arm |= weights[:, BONES.index(name)] > 0
    side = smoothstep(bind[:, 0], -0.02, 0.02)
    out = {}
    for kind, mask in (('arm_down', arm), ('legs_straight', ~arm)):
        part = moves * mask[:, None]
        out[f'{kind}_L'] = part * side[:, None]
        out[f'{kind}_R'] = part * (1 - side)[:, None]
    return {name: out[name] for name in SHAPES}


def seat_extras(rule, prop, top):
    """Gives the seat of the rule `chair` for the extras of the asset: the seat of the app that
    takes its place (`prop`), the seat top, the front and the back edges on z, and the half width
    on x, in the units of the body. `pnpm body-module` fits the seat of the app to it. Each
    number is a 32-bit float, as a vertex of the file, so that the export gives the same values as
    from the box of a chair mesh."""

    def single(value):
        """Gives the value as a 32-bit float."""
        return float(np.float32(value))

    return {
        'prop': prop,
        'top': single(top),
        'front': single(rule['front']),
        'back': single(rule['back']),
        'halfWidth': single(rule['halfWidth']),
    }


class GlbWriter:
    """Collects the buffer views and the accessors of a GLB file."""

    def __init__(self):
        """Starts an empty binary chunk."""
        self.bin = bytearray()
        self.views = []
        self.accessors = []

    def add(self, array, component, kind, minmax=False, normalized=False):
        """Adds an accessor of a numpy array, and gives its index."""
        data = np.ascontiguousarray(array).tobytes()
        while len(self.bin) % 4:
            self.bin.append(0)
        self.views.append({'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(data)})
        self.bin += data
        count = len(array)
        accessor = {
            'bufferView': len(self.views) - 1,
            'componentType': component,
            'count': count,
            'type': kind,
        }
        if normalized:
            accessor['normalized'] = True
        if minmax:
            flat = np.asarray(array, float).reshape(count, -1)
            accessor['min'] = [float(np.float32(x)) for x in flat.min(axis=0)]
            accessor['max'] = [float(np.float32(x)) for x in flat.max(axis=0)]
        self.accessors.append(accessor)
        return len(self.accessors) - 1

    def floats(self, array, kind, minmax=False):
        """Adds an accessor of 32-bit floats."""
        return self.add(np.asarray(array, np.float32), 5126, kind, minmax)


def primitive_arrays(points, tris, colors, materials, weights, shapes, name, base=None, uvs=None):
    """Gives the vertex arrays of the faces of one material: each corner with its face color is
    one vertex, so that each face keeps one color. With `base`, the colors before
    `colors.shift`, each vertex also has the base color of its face. With `uvs` (triangles × 3 ×
    2, in the axes of glTF), each corner also has its texture point, so that a UV seam splits
    the vertex."""
    faces = np.nonzero(materials == name)[0]
    keys, index, corners = {}, [], []
    for f in faces:
        c = tuple(np.round(linear(colors[f]), 7))
        b = c if base is None else tuple(np.round(linear(base[f]), 7))
        row = []
        for k, v in enumerate(tris[f]):
            uv = () if uvs is None else tuple(float(x) for x in uvs[f, k])
            key = (int(v), c, b, uv)
            if key not in keys:
                keys[key] = len(index)
                index.append(key)
            row.append(keys[key])
        corners.append(row)
    vertex = np.array([k[0] for k in index])
    color = np.array([k[1] for k in index])
    base_color = np.array([k[2] for k in index])
    texcoord = np.array([k[3] for k in index], np.float32) if uvs is not None else None
    joints = np.zeros((len(vertex), 4), np.uint8)
    values = np.zeros((len(vertex), 4), np.float32)
    for i, v in enumerate(vertex):
        bones = sorted(np.nonzero(weights[v] > 0)[0], key=lambda k: (-weights[v, k], k))
        for j, k in enumerate(bones):
            joints[i, j] = k
            values[i, j] = weights[v, k]
    return {
        'position': points[vertex],
        'color': color,
        'base': base_color,
        'joints': joints,
        'weights': values,
        'uv': texcoord,
        'shapes': [shape[vertex] for shape in shapes.values()],
        'indices': np.array(corners, np.uint32),
    }


def write_glb(
    path,
    config,
    bind,
    tris,
    colors,
    materials,
    weights,
    shapes,
    bind_frames,
    bind_heads,
    src_frames,
    src_heads,
    extras,
    base=None,
    generator='pawchestra tools/blender/rig_mesh.py',
    uvs=None,
):
    """Writes the rig as a GLB file in the format of a body, with the extras of the asset
    for `pnpm body-module`. The file holds only the animal: the seat is numbers in the extras
    (`seat_extras()`). The morph targets are the shapes, in their order. With `base`, the colors
    before `colors.shift`, the attribute `COLOR_1` holds them. With `uvs`, the texture point of
    each corner (`primitive_arrays()`), the attribute `TEXCOORD_0` holds them. `generator` names
    the script that writes the file: `export_rig.py` writes with this function."""
    w = GlbWriter()
    shape_names = list(shapes)
    mats = [
        {
            'name': name,
            'doubleSided': True,
            'pbrMetallicRoughness': {'metallicFactor': 0.0, 'roughnessFactor': rough},
        }
        for name, rough in MATERIALS
    ]

    primitives = []
    for k, (name, _) in enumerate(MATERIALS):
        # A mesh with no face of a material, such as a hand rig whose nose takes the color map,
        # writes no primitive of it.
        if not np.any(materials == name):
            continue
        arrays = primitive_arrays(bind, tris, colors, materials, weights, shapes, name, base, uvs)
        attributes = {
            'POSITION': w.floats(arrays['position'], 'VEC3', minmax=True),
            'COLOR_0': w.floats(arrays['color'], 'VEC3'),
        }
        if base is not None:
            attributes['COLOR_1'] = w.floats(arrays['base'], 'VEC3')
        if uvs is not None:
            attributes['TEXCOORD_0'] = w.floats(arrays['uv'], 'VEC2')
        attributes['JOINTS_0'] = w.add(arrays['joints'], 5121, 'VEC4')
        attributes['WEIGHTS_0'] = w.floats(arrays['weights'], 'VEC4')
        primitives.append(
            {
                'attributes': attributes,
                'indices': w.add(arrays['indices'].ravel(), 5125, 'SCALAR'),
                'material': k,
                'targets': [
                    {'POSITION': w.floats(s, 'VEC3', minmax=True)} for s in arrays['shapes']
                ],
            }
        )

    # The joints: the local place and turn of each bone in the bind pose and in the clip.
    def local(frames, heads, name):
        parent = PARENTS[name]
        if parent is None:
            return heads[name], frames[name]
        back = frames[parent].T
        return back @ (heads[name] - heads[parent]), back @ frames[name]

    first = 1
    nodes = [{'name': config['name'], 'mesh': 0, 'skin': 0}]
    joint_index = {name: first + k for k, name in enumerate(BONES)}
    inverse = []
    for name in BONES:
        t, r = local(bind_frames, bind_heads, name)
        node = {
            'name': name,
            'rotation': [float(x) for x in matrix_quat(r)],
            'translation': [float(x) for x in t],
        }
        children = [joint_index[c] for c in BONES if PARENTS[c] == name]
        if children:
            node['children'] = children
        nodes.append(node)
        world = np.eye(4)
        world[:3, :3] = bind_frames[name]
        world[:3, 3] = bind_heads[name]
        inverse.append(np.linalg.inv(world).T.ravel())
    nodes.append({'name': f'{config["name"]}Rig', 'children': [0, joint_index['root']]})

    times = w.floats(np.zeros(1), 'SCALAR', minmax=True)

    def clip(name, frames, heads, weights):
        """Gives the animation of one key: the local place and turn of each bone, and the
        weights of the morph targets."""
        channels, samplers = [], []
        for bone in BONES:
            t, r = local(frames, heads, bone)
            for target, value, kind in (
                ('translation', t, 'VEC3'),
                ('rotation', matrix_quat(r), 'VEC4'),
            ):
                samplers.append(
                    {
                        'input': times,
                        'output': w.floats(np.asarray([value]), kind),
                        'interpolation': 'LINEAR',
                    }
                )
                channels.append(
                    {
                        'sampler': len(samplers) - 1,
                        'target': {'node': joint_index[bone], 'path': target},
                    }
                )
        samplers.append(
            {
                'input': times,
                'output': w.floats(np.array(weights), 'SCALAR'),
                'interpolation': 'LINEAR',
            }
        )
        channels.append({'sampler': len(samplers) - 1, 'target': {'node': 0, 'path': 'weights'}})
        return {'name': name, 'channels': channels, 'samplers': samplers}

    # The clip `reference` gives the source back: each shape has its full weight, but the shapes
    # of a raised arm.
    animations = [
        clip(
            'reference',
            src_frames,
            src_heads,
            [0.0 if name.startswith('arm_raise') else 1.0 for name in shape_names],
        )
    ]

    gltf = {
        'asset': {'generator': generator, 'version': '2.0'},
        'scene': 0,
        'scenes': [{'name': 'Scene', 'nodes': [len(nodes) - 1]}],
        'nodes': nodes,
        'animations': animations,
        'materials': mats,
        'meshes': [
            {
                'name': config['name'],
                'primitives': primitives,
                'weights': [0.0] * len(shape_names),
                'extras': {'targetNames': shape_names},
            },
        ],
        'skins': [
            {
                'name': f'{config["name"]}Rig',
                'joints': [joint_index[n] for n in BONES],
                'skeleton': joint_index['root'],
                'inverseBindMatrices': w.floats(np.array(inverse), 'MAT4'),
            }
        ],
        'accessors': w.accessors,
        'bufferViews': w.views,
        'buffers': [{'byteLength': len(w.bin)}],
    }
    gltf['asset']['extras'] = extras
    text = json.dumps(gltf, separators=(',', ':')).encode()
    text += b' ' * (-len(text) % 4)
    data = bytes(w.bin) + b'\0' * (-len(w.bin) % 4)
    gltf['buffers'][0]['byteLength'] = len(w.bin)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(text) + 8 + len(data))
    out += struct.pack('<II', len(text), 0x4E4F534A) + text
    out += struct.pack('<II', len(data), 0x004E4942) + data
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(out)
    log(f'wrote {path}: {len(out)} bytes')
