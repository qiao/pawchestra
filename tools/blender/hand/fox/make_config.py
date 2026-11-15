"""Writes tools/mesh-rigs/simple/fox-tripo.json from the measured joints of the Tripo fox and
the parameters of tools/blender/hand/fox/params.json. The joints are measured on the source mesh,
then mapped through the paw turns and the point edits of the params (redits.py), so that the
config holds the joints of the edited mesh.

    uv run --no-project --with numpy python -I tools/blender/hand/fox/make_config.py
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
    'hips': ([0, 0.32, 0.055], 'spine'),
    'spine': ([0, 0.40, 0.065], 'spine1'),
    'spine1': ([0, 0.48, 0.08], 'chest'),
    'chest': ([0, 0.56, 0.085], 'neck'),
    'neck': ([0, 0.675, 0.06], 'head'),
    'head': ([0, 0.715, 0.06], [0, 0.92, 0.05]),
    'ear_L': ([0.075, 0.895, 0.05], [0.104, 1.0, 0.055]),
    'clavicle_L': ([0.015, 0.628, 0.072], 'upper_arm_L'),
    'upper_arm_L': ([0.09, 0.626, 0.075], 'forearm_L'),
    'forearm_L': ([0.168, 0.6234, 0.071], 'forearm_twist_L'),
    'forearm_twist_L': ([0.203, 0.622, 0.068], 'hand_L'),
    'hand_L': ([0.238, 0.620, 0.066], 'fingers_L'),
    'fingers_L': ([0.295, 0.608, 0.068], [0.333, 0.600, 0.065]),
    'thigh_L': ([0.07, 0.30, 0.066], 'shin_L'),
    'shin_L': ([0.078, 0.165, 0.05], 'foot_L'),
    'foot_L': ([0.0915, 0.067, 0.054], 'toes_L'),
    'toes_L': ([0.115, 0.02, 0.12], [0.12, 0.01, 0.165]),
    'tail': ([0, 0.329, -0.048], 'tail_tip'),
    'tail_tip': ([0, 0.22, -0.15], [0, 0.071, -0.228]),
}
#: The joints of the right side that do not mirror the left side: the legs and the right ear of
#: the source stand apart from the mirrors of the left ones by up to 0.026 units.
SOURCE_R = {
    'ear_R': ([-0.095, 0.895, 0.05], [-0.13, 0.997, 0.055]),
    'thigh_R': ([-0.06, 0.30, 0.066], 'shin_R'),
    'shin_R': ([-0.0612, 0.165, 0.05], 'foot_R'),
    'foot_R': ([-0.067, 0.067, 0.054], 'toes_R'),
    'toes_R': ([-0.089, 0.02, 0.12], [-0.093, 0.01, 0.165]),
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
    'foot_R': [0, 1, 0],
    'toes_R': [0, 1, 0],
}
TAIL_JOINTS = {'tail', 'tail_tip'}


def source_joints():
    out = {}
    for name, (head, tail) in {**SOURCE, **SOURCE_R}.items():
        out[name] = {'head': list(head), 'tail': tail}
    return out


P['sourceJoints'] = source_joints()


def turned(head, side):
    """A point of the left fingers bone turned with the paw of a side (the paw turn of build.py)."""
    m = np.array([1.0 if side == 'L' else -1.0, 1, 1])
    f, axis = ce.paw_axis(P['sourceJoints'], side)
    return ce.rotation(axis, ce.paw_turn_angle(P, side)) @ (np.array(head, float) * m - f) + f


def mapped_joints():
    out = {}
    for name in list(SOURCE) + list(SOURCE_R) + ['fingers_R']:
        if name in ('fingers_L', 'fingers_R'):
            side = name[-1]
            head, tail = SOURCE['fingers_L']
            head, tail = turned(head, side), turned(tail, side)
        else:
            head, tail = {**SOURCE, **SOURCE_R}[name]
        pts = [np.array(head, float)] + (
            [np.array(tail, float)] if not isinstance(tail, str) else []
        )
        pts = np.array(pts)
        tail_mask = np.full(len(pts), name in TAIL_JOINTS)
        pts = ce.map_points(pts, dict(P, _joints=True), tail_mask)
        joint = {'head': [round(float(x), 6) for x in pts[0]]}
        joint['tail'] = [round(float(x), 6) for x in pts[1]] if len(pts) > 1 else tail
        if name in ROLLS or name == 'fingers_R':
            joint['roll'] = ROLLS.get(name, 'palm')
        out[name] = joint
    return out


def main():
    cfg = json.load(open(os.path.join(HERE, 'base-config.json')))
    joints = mapped_joints()
    if not P.get('pawTurn', {}).get('R'):
        joints.pop('fingers_R')
    cfg['joints'] = joints
    cfg['sourceNote'] = (
        'The Tripo P2 fox mesh with its quads (tripo-p2/fox.fbx, '
        'assets/models/fox/README.md). The hand rig assets/models/fox/tripo-hand/fox.blend starts from it in headless Blender with the calls '
        'of tools/blender/body_armature.py (design 4.4, "Hand rig").'
    )
    cfg['palm'] = P['palm']
    cfg['texture'] = P['sourceTexture']
    cfg['sourceNote'] = cfg['sourceNote']
    st = cfg['bind']
    st.pop('legTurns', None)
    if 'tailBind' in P:
        st['tailBind'] = P['tailBind']
    if 'bindUpper' in P:
        st['bindArms']['upper_arm'] = P['bindUpper']
    cfg['chair'] = P['chair']
    cfg['chairNote'] = (
        'The seat of the rig in units of this body, as the property seat of the '
        'armature of tripo-hand/fox.blend holds it.'
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
    path = os.path.join(ROOT, 'tools/mesh-rigs/simple/fox-tripo.json')
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
    lt = P['legTurns']
    heel = (
        (
            ', and the foot turns {} degrees with the heel up, the toes flat on the floor, so that '
            'the seat is higher'.format(lt[3])
        )
        if len(lt) > 3
        else ''
    )
    st['note'] = (
        'legTurns gives the world turn of each left leg bone from the seated bind to the source: '
        'the thigh slopes {} degrees down and {} degrees out, and the shin leans {} degrees forward '
        'of vertical, so that most of the thigh lies on the seat{} (uv run --no-project --with numpy '
        'python -I tools/rig/leg_turns.py <config> {}).'.format(
            *lt[:3], heel, ' '.join(map(str, lt))
        )
    )
    with open(path, 'w') as f:
        json.dump(cfg, f, indent=2)
        f.write('\n')
    print('wrote', path)


if __name__ == '__main__':
    main()
