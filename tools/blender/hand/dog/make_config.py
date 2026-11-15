"""Writes tools/mesh-rigs/simple/dog-tripo.json from the measured joints of the Tripo beagle
and the parameters of tools/blender/hand/dog/params.json. The joints are measured on the source mesh, then
mapped through the paw turns and the point edits of the params (redits.py), so that the config
holds the joints of the edited mesh.

    uv run --no-project --with numpy python -I tools/blender/hand/dog/make_config.py
"""

import json
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
sys.path.insert(0, HERE)
import redits as ce  # noqa: E402

P = json.load(open(os.path.join(HERE, 'params.json')))

#: The joints of the source (body units and axes: 1 unit from the soles to the ear tips, the
#: soles at y 0, +z forward, +x the left side), measured on sections of the mesh and its loops.
SOURCE = {
    'root': ([0, 0, 0], [0, 0, 0.1]),
    'hips': ([0, 0.30, 0.015], 'spine'),
    'spine': ([0, 0.39, 0.015], 'spine1'),
    'spine1': ([0, 0.48, 0.02], 'chest'),
    'chest': ([0, 0.56, 0.02], 'neck'),
    'neck': ([0, 0.65, 0.02], 'head'),
    'head': ([0, 0.71, 0.03], [0, 0.98, 0.04]),
    'ear_L': ([0.11, 0.91, 0.0], [0.165, 0.73, 0.04]),
    'clavicle_L': ([0.015, 0.645, 0.03], 'upper_arm_L'),
    'upper_arm_L': ([0.10, 0.648, 0.026], 'forearm_L'),
    'forearm_L': ([0.205, 0.641, 0.025], 'forearm_twist_L'),
    'forearm_twist_L': ([0.2575, 0.637, 0.027], 'hand_L'),
    'hand_L': ([0.31, 0.632, 0.03], 'fingers_L'),
    'fingers_L': ([0.375, 0.624, 0.038], [0.428, 0.62, 0.035]),
    'thigh_L': P.get('hipJoint', ([0.083, 0.28, 0.02], 'shin_L')),
    'shin_L': ([0.083, 0.16, 0.0], 'foot_L'),
    'foot_L': ([0.088, 0.055, -0.005], 'toes_L'),
    'toes_L': ([0.09, 0.025, 0.07], [0.095, 0.015, 0.13]),
    'tail': ([0, 0.34, -0.085], 'tail_tip'),
    'tail_tip': ([0, 0.30, -0.17], [0, 0.47, -0.235]),
}
ROLLS = {
    'root': [0, 1, 0],
    'upper_arm_L': 'palm',
    'forearm_L': 'palm',
    'forearm_twist_L': 'palm',
    'hand_L': 'palm',
    'fingers_L': 'palm',
    'foot_L': [0, 1, 0],
    'toes_L': [0, 1, 0],
    'tail': [0, 1, 0],
    'tail_tip': [0, 1, 0],
}
TAIL_JOINTS = {'tail', 'tail_tip'}


def source_joints():
    out = {}
    for name, (head, tail) in SOURCE.items():
        out[name] = {'head': list(head), 'tail': tail}
    return out


P['sourceJoints'] = source_joints()


def turned(head, side):
    """A point of the left fingers bone turned with the paw of a side (the paw turn of build.py)."""
    m = np.array([1.0 if side == 'L' else -1.0, 1, 1])
    f, axis = ce.paw_axis(P['sourceJoints'], side)
    return ce.rotation(axis, ce.paw_turn_angle(P, side)) @ (np.array(head, float) * m - f) + f


def mapped_joints(scale=True):
    """The joints of the config. With scale False, the joints of the rig before the head scale."""
    out = {}
    for name in list(SOURCE) + ['fingers_R']:
        if name in ('fingers_L', 'fingers_R'):
            side = name[-1]
            head, tail = SOURCE['fingers_L']
            head, tail = turned(head, side), turned(tail, side)
        else:
            head, tail = SOURCE[name]
        pts = [np.array(head, float)] + (
            [np.array(tail, float)] if not isinstance(tail, str) else []
        )
        pts = np.array(pts)
        tail_mask = np.full(len(pts), name in TAIL_JOINTS)
        pts = ce.map_points(pts, P, tail_mask)
        joint = {'head': [round(float(x), 6) for x in pts[0]]}
        joint['tail'] = [round(float(x), 6) for x in pts[1]] if len(pts) > 1 else tail
        if name in ROLLS or name == 'fingers_R':
            joint['roll'] = ROLLS.get(name, 'palm')
        out[name] = joint
    return scaled_head(out) if scale else out


#: The joints that the head scale moves (headScale of the params): the head, and the ears with it.
HEAD_JOINTS = ('head', 'ear_L')


def scaled_head(joints):
    """The joints with the head and the ears scaled about the neck joint by headScale.factor of the
    params, as the build scales the head (scale_head() of build.py)."""
    rule = P.get('headScale')
    if not rule:
        return joints
    f = float(rule['factor'])
    pivot = np.array(joints['neck']['head'], float)
    out = dict(joints)
    for name in HEAD_JOINTS:
        joint = dict(out[name])
        for key in ('head', 'tail'):
            if not isinstance(joint[key], str):
                p = pivot + f * (np.array(joint[key], float) - pivot)
                joint[key] = [round(float(x), 6) for x in p]
        out[name] = joint
    return out


def main():
    cfg = json.load(open(os.path.join(HERE, 'base-config.json')))
    joints = mapped_joints()
    if not P.get('pawTurn', {}).get('R'):
        joints.pop('fingers_R')
    cfg['joints'] = joints
    cfg['sourceNote'] = (
        'The Tripo P2 beagle mesh with its quads (assets/models/dog/README.md). The hand rig '
        'assets/models/dog/tripo-hand/dog.blend starts from it in headless Blender with the calls '
        'of tools/blender/body_armature.py (design 4.4, "Hand rig").'
    )
    cfg['palm'] = P['palm']
    cfg['texture'] = P['sourceTexture']
    cfg['sourceNote'] = cfg['sourceNote']
    st = cfg['bind']
    st.pop('legTurns', None)
    st['tailBind'] = P['tailBind']
    st['tailBindNote'] = P['tailBindNote']
    cfg['chair'] = P['chair']
    cfg['chairNote'] = (
        'The seat of the rig in units of this body, as the property seat of the '
        'armature of tripo-hand/dog.blend holds it.'
    )
    c = cfg['colors']
    box = lambda lo, hi: [
        [round(float(x), 6) for x in p] for p in ce.map_points(np.array([lo, hi], float), P)
    ]
    c['eyeBox'] = box(*P['eyeBox'])
    c['noseBox'] = box(*P['noseBox'])
    c['eyeBoxNote'] = P['eyeBoxNote']
    cfg['body'] = P['body']
    cfg['bodyNote'] = P['bodyNote']
    cfg['metersPerUnit'] = P['metersPerUnit']
    cfg['metersPerUnitNote'] = P['metersPerUnitNote']
    cfg['eyeSize'] = P['eyeSize']
    cfg['eyeSizeNote'] = (
        'The head height H of the body in units, as body-module measures it on the export, before '
        'the head size. The hand rig keeps the eyes of the mesh, so it places no pea eye.'
    )
    cfg['jointsNote'] = P['jointsNote']
    if P.get('headScale'):
        cfg['headScale'] = P['headScale']
    path = os.path.join(ROOT, 'tools/mesh-rigs/simple/dog-tripo.json')
    with open(path, 'w') as f:
        json.dump(cfg, f, indent=2)
        f.write('\n')
    turns = (
        subprocess.run(
            [
                'uv',
                'run',
                '-q',
                '--no-project',
                '--with',
                'numpy',
                'python',
                '-I',
                os.path.join(ROOT, 'tools/rig/leg_turns.py'),
                path,
                *map(str, P['legTurns']),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        .stdout.strip()
        .splitlines()
    )
    print(turns[0])
    st['legTurns'] = json.loads(turns[-1])
    st['note'] = (
        'legTurns gives the world turn of each left leg bone from the seated bind to the source: '
        'the thigh slopes {} degrees down and {} degrees out, and the shin leans {} degrees forward '
        'of vertical, as on the dog of main: the knees spread around the lower bout of the cello (uv run --no-project --with numpy '
        'python -I tools/rig/leg_turns.py <config> {} {} {}).'.format(
            *P['legTurns'], *P['legTurns']
        )
    )
    with open(path, 'w') as f:
        json.dump(cfg, f, indent=2)
        f.write('\n')
    print('wrote', path)


if __name__ == '__main__':
    main()
