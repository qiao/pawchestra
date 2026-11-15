"""Writes tools/mesh-rigs/simple/penguin-tripo.json from the measured joints of the Tripo penguin
and the parameters of tools/blender/hand/penguin/params.json. The joints are measured on the source mesh, then
mapped through the paw turns and the point edits of the params (redits.py), so that the config
holds the joints of the edited mesh.

    uv run --no-project --with numpy python -I tools/blender/hand/penguin/make_config.py
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
    'hips': ([0, 0.20, -0.06], 'spine'),
    'spine': ([0, 0.32, -0.06], 'spine1'),
    'spine1': ([0, 0.44, -0.06], 'chest'),
    'chest': ([0, 0.56, -0.06], 'neck'),
    'neck': ([0, 0.72, -0.055], 'head'),
    'head': ([0, 0.78, -0.05], [0, 1.0, -0.03]),
    'ear_L': ([0.05, 0.95, -0.03], [0.06, 0.98, -0.03]),
    'clavicle_L': ([0.03, 0.65, -0.08], 'upper_arm_L'),
    'upper_arm_L': ([0.16, 0.645, -0.10], 'forearm_L'),
    'forearm_L': ([0.265, 0.647, -0.099], 'forearm_twist_L'),
    'forearm_twist_L': ([0.315, 0.648, -0.094], 'hand_L'),
    'hand_L': ([0.365, 0.645, -0.087], 'fingers_L'),
    'fingers_L': ([0.42, 0.633, -0.083], [0.468, 0.618, -0.083]),
    'thigh_L': P.get('hipJoint', ([0.085, 0.18, -0.04], 'shin_L')),
    'shin_L': ([0.095, 0.11, -0.03], 'foot_L'),
    'foot_L': ([0.10, 0.05, -0.04], 'toes_L'),
    'toes_L': ([0.10, 0.015, 0.04], [0.10, 0.008, 0.11]),
    'tail': ([0, 0.12, -0.19], 'tail_tip'),
    'tail_tip': ([0, 0.073, -0.2207], [0, 0.04, -0.242]),
}
if P.get('jaw'):
    SOURCE['jaw'] = tuple(P['jaw'])
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
    'jaw': [0, 1, 0],
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


def mapped_joints():
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
    return out


def main():
    cfg = json.load(open(os.path.join(HERE, 'base-config.json')))
    joints = mapped_joints()
    if not P.get('pawTurn', {}).get('R'):
        joints.pop('fingers_R')
    cfg['joints'] = joints
    cfg['sourceNote'] = (
        'The Tripo P2 penguin mesh with its quads (assets/models/penguin/README.md). The hand rig '
        'assets/models/penguin/tripo-hand/penguin.blend starts from it in headless Blender with the calls '
        'of tools/blender/body_armature.py (design 4.4, "Hand rig").'
    )
    cfg['palm'] = P['palm']
    cfg['texture'] = P['sourceTexture']
    cfg['sourceNote'] = cfg['sourceNote']
    st = cfg['bind']
    st.pop('legTurns', None)
    unit = lambda v: [round(float(x), 4) for x in np.asarray(v, float) / np.linalg.norm(v)]
    tj = P['sourceJoints']
    st['tailBind'] = P['tailBind'] or {
        'tail': unit(np.subtract(tj['tail_tip']['head'], tj['tail']['head'])),
        'tail_tip': unit(np.subtract(tj['tail_tip']['tail'], tj['tail_tip']['head'])),
    }
    st['tailBindNote'] = P['tailBindNote']
    cfg['chair'] = P['chair']
    cfg['chairNote'] = (
        'The seat of the rig in units of this body, as the property seat of the '
        'armature of tripo-hand/penguin.blend holds it.'
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
    path = os.path.join(ROOT, 'tools/mesh-rigs/simple/penguin-tripo.json')
    with open(path, 'w') as f:
        json.dump(cfg, f, indent=2)
        f.write('\n')
    st['legTurns'] = {k: [0.0, 0.0, 0.0, 1.0] for k in ('thigh', 'shin', 'foot', 'toes')}
    st['trunk'] = P.get('trunkBind', {'open': 0, 'shares': st['trunk']['shares']})
    st['trunkNote'] = P.get('trunkNote', '')
    st['note'] = P.get('legNote', '')
    for k, v in P.get('bind', {}).items():
        st[k] = v
    with open(path, 'w') as f:
        json.dump(cfg, f, indent=2)
        f.write('\n')
    print('wrote', path)


if __name__ == '__main__':
    main()
