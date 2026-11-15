"""Writes tools/mesh-rigs/simple/badger-tripo.json from the measured joints of the Tripo badger
and the parameters of tools/blender/hand/badger/params.json. The joints are measured on the source mesh, then
mapped through the paw turns and the point edits of the params (redits.py), so that the config
holds the joints of the edited mesh.

    uv run --no-project --with numpy python -I tools/blender/hand/badger/make_config.py
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
    'hips': ([0, 0.24, -0.01], 'spine'),
    'spine': ([0, 0.34, -0.01], 'spine1'),
    'spine1': ([0, 0.44, -0.01], 'chest'),
    'chest': ([0, 0.54, -0.005], 'neck'),
    'neck': ([0, 0.68, -0.01], 'head'),
    'head': ([0, 0.73, 0.0], [0, 1.0, 0.02]),
    'ear_L': ([0.125, 0.90, -0.02], [0.135, 0.99, -0.02]),
    'clavicle_L': ([0.03, 0.63, 0.02], 'upper_arm_L'),
    'upper_arm_L': ([0.17, 0.613, 0.02], 'forearm_L'),
    'forearm_L': ([0.263, 0.612, 0.022], 'forearm_twist_L'),
    'forearm_twist_L': ([0.3095, 0.612, 0.028], 'hand_L'),
    'hand_L': ([0.356, 0.613, 0.04], 'fingers_L'),
    'fingers_L': ([0.41, 0.603, 0.05], [0.467, 0.588, 0.05]),
    'thigh_L': ([0.10, 0.25, 0.0], 'shin_L'),
    'shin_L': ([0.11, 0.13, -0.025], 'foot_L'),
    'foot_L': ([0.115, 0.05, -0.03], 'toes_L'),
    'toes_L': ([0.125, 0.02, 0.09], [0.13, 0.01, 0.175]),
    'tail': ([0, 0.28, -0.20], 'tail_tip'),
    'tail_tip': ([0, 0.20, -0.265], [0, 0.13, -0.322]),
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
        'The Tripo P2 badger mesh with its quads (assets/models/badger/README.md). The hand rig '
        'assets/models/badger/tripo-hand/badger.blend starts from it in headless Blender with the calls '
        'of tools/blender/body_armature.py (design 4.4, "Hand rig").'
    )
    cfg['source'] = 'assets/models/badger/tripo-p2/badger.fbx'
    cfg['name'] = 'Badger'
    cfg['palm'] = P['palm']
    cfg['texture'] = P['sourceTexture']
    cfg['sourceNote'] = cfg['sourceNote']
    st = cfg['bind']
    st.pop('legTurns', None)
    if 'bindUpper' in P:
        st['bindArms']['upper_arm'] = P['bindUpper']
    cfg['chair'] = P['chair']
    cfg['chairNote'] = (
        'The seat of the rig in units of this body, as the property seat of the '
        'armature of tripo-hand/badger.blend holds it.'
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
    path = os.path.join(ROOT, 'tools/mesh-rigs/simple/badger-tripo.json')
    with open(path, 'w') as f:
        json.dump(cfg, f, indent=2)
        f.write('\n')
    if P.get('legTurnsIdentity'):
        st['legTurns'] = {b: [0.0, 0.0, 0.0, 1.0] for b in ('thigh', 'shin', 'foot', 'toes')}
        st['note'] = (
            'legTurns gives the world turn of each left leg bone from the seated bind to the '
            'source: no turn. The badger stands at each percussion instrument on its legs in the '
            'pose of the source, with the feet flat on the floor.'
        )
    else:
        raise SystemExit('legTurns: only the identity')
    if 'trunkOpen' in P:
        st['trunk']['open'] = P['trunkOpen']
        st['trunkNote'] = (
            'The trunk of the bind keeps the pose of the source (open 0: no recline, '
            'trunk_turn() of tools/blender/rig_mesh.py).'
        )
    if 'tailBind' in P:
        st['tailBind'] = P['tailBind']
        st['tailBindNote'] = (
            'The direction of each tail bone in the seated bind (bind_turns() of '
            'tools/blender/rig_mesh.py): the directions of the source, so that the tail '
            'goes down and back from the haunch as in the source.'
        )
    with open(path, 'w') as f:
        json.dump(cfg, f, indent=2)
        f.write('\n')
    print('wrote', path)


if __name__ == '__main__':
    main()
