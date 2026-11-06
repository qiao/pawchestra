"""A step of `pnpm rig-trial` (`tools/blender/rig_trial.py`): adds a digit bone to each claw of
the polar bear paws (design 4.4, "Hand rig").

    pnpm rig-trial polar-bear pianist <tag> tools/blender/trial_steps/paw_digits.py \
        --base <tag of paw_wrist_off.py>

Each paw has a row of claw spikes at the rim of its tip. The step adds the one-joint bones
`digit1_<side>` (the thumb side, -y) to `digit5_<side>` under `fingers_<side>`, from the middle of
the fur rim at the base of each claw to its claw tip, with the roll of the palm (`sa.hint()`).
The Action `bind` keys no digit, so each digit keeps the turn of the fingers in the bind, and no
vertex of the bind moves. Then each claw vertex of `ROWS` takes its exact row
(`sa.set_weight_row()`). The other vertices keep their rows. The vertex lists come from the
dark claw faces of the paw: each dark vertex goes to the claw tip of the shortest path along the
dark faces. A vertex at the fur rim, or more than 0.022 units from its tip, is a base vertex. A
vertex with two tips at almost the same path length is a joined base. A dark vertex more than
0.03 units from each tip, such as the dark rim along the side of the paw, keeps its row. A claw
vertex keeps its share of `forearm_seg3_<side>`, and the row takes the rest, because that segment
turns less than the paw in the bind: a vertex that lost the share would move in the bind.

The 7 vertices of the middle claw of the right paw (445 to 448, 1025, 1026, 1387) are an island
that the automatic weights gave half to `clavicle_R` and the upper arm segments. In the bind the
claw was a spike of thin faces 5 cm long. Their rows put the claw back on the paw, so these 7
vertices move in the bind, back to the form of the source mesh.
"""

from mathutils import Vector

import bpy

import studio_armature as sa

#: The head and the tail of each digit bone in the rest, in units: the middle of the fur rim at
#: the base of its claw, and its claw tip (the mean of two tips for the digits 1 and 2).
DIGITS = {
    'digit1_L': ((0.4685, -0.0132, 0.7197), (0.4795, -0.0157, 0.7123)),
    'digit2_L': ((0.4790, 0.0057, 0.7305), (0.4961, 0.0039, 0.7162)),
    'digit3_L': ((0.4863, 0.0232, 0.7260), (0.5000, 0.0245, 0.7162)),
    'digit4_L': ((0.4760, 0.0357, 0.7309), (0.4922, 0.0421, 0.7182)),
    'digit5_L': ((0.4656, 0.0510, 0.7210), (0.4824, 0.0519, 0.7104)),
    'digit1_R': ((-0.4676, -0.0162, 0.7202), (-0.4795, -0.0157, 0.7123)),
    'digit2_R': ((-0.4787, 0.0054, 0.7295), (-0.4961, 0.0039, 0.7162)),
    'digit3_R': ((-0.4785, 0.0225, 0.7241), (-0.5000, 0.0245, 0.7162)),
    'digit4_R': ((-0.4760, 0.0357, 0.7309), (-0.4922, 0.0421, 0.7182)),
    'digit5_R': ((-0.4650, 0.0521, 0.7209), (-0.4824, 0.0519, 0.7104)),
}

#: The claw vertices of each row, by side: the spike (`digit k` 1), the base at the fur rim
#: (`digit k` and `fingers` 0.5 each), and the joined base of two claws (0.5 each).
ROWS = {
    'L': [
        ({'digit1_L': 1.0}, [758, 1080, 1081, 1202, 1312, 1315, 1644, 1645, 1646, 2004, 2005, 2006, 2007, 2179, 2206, 2212, 2231]),
        ({'digit1_L': 0.5, 'digit2_L': 0.5}, [759]),
        ({'digit1_L': 0.5, 'fingers_L': 0.5}, [529, 530, 704, 1079, 1201, 1313, 1314, 2046, 2089]),
        ({'digit2_L': 1.0}, [203, 204, 205, 206, 506, 507, 518, 519, 520, 521, 582, 583, 1027, 1293, 1294, 1655, 2147]),
        ({'digit2_L': 0.5, 'fingers_L': 0.5}, [505, 508, 581, 703, 757, 2090, 2136]),
        ({'digit3_L': 1.0}, [1345, 1635, 2185]),
        ({'digit3_L': 0.5, 'fingers_L': 0.5}, [584, 732, 733, 1346, 1610, 1636]),
        ({'digit4_L': 1.0}, [1132, 1133, 1134, 1135, 1548, 1549, 1602, 2109, 2110]),
        ({'digit4_L': 0.5, 'fingers_L': 0.5}, [730, 1547, 1593, 1612]),
        ({'digit5_L': 1.0}, [1379, 1380, 1381, 1382, 1570, 1580, 1581, 1582]),
        ({'digit5_L': 0.5, 'fingers_L': 0.5}, [177, 178, 180, 1414, 1415, 1550, 1571, 1588, 2077]),
    ],
    'R': [
        ({'digit1_R': 1.0}, [683, 684, 685, 686, 1493, 1656, 1657, 2145, 2146, 2331, 2332, 2351, 2352, 2385]),
        ({'digit1_R': 0.5, 'digit2_R': 0.5}, [1232, 1233, 1664]),
        ({'digit1_R': 0.5, 'fingers_R': 0.5}, [1296, 1297, 1494, 1495, 1625, 1647, 1673, 2079, 2083]),
        ({'digit2_R': 1.0}, [122, 123, 124, 125, 278, 281, 302, 303, 1234, 1417, 1418, 1423, 1424, 1425, 1640, 1691, 1692, 1693, 1694, 1695]),
        ({'digit2_R': 0.5, 'fingers_R': 0.5}, [279, 301, 304, 1052, 1054, 1235, 1685, 1824]),
        ({'digit3_R': 1.0}, [445, 446, 447, 448, 1025, 1026, 1387]),
        ({'digit3_R': 0.5, 'fingers_R': 0.5}, [280, 2093]),
        ({'digit4_R': 1.0}, [750, 751, 752, 753, 1597, 1598, 1599, 1600, 1620]),
        ({'digit4_R': 0.5, 'digit5_R': 0.5}, [1590]),
        ({'digit4_R': 0.5, 'fingers_R': 0.5}, [1594, 1595, 1621, 1622]),
        ({'digit5_R': 1.0}, [466, 467, 468, 469, 1087, 1089, 1231, 1579]),
        ({'digit5_R': 0.5, 'fingers_R': 0.5}, [32, 35, 426, 1088, 1522, 1573, 1591, 1837]),
    ],
}


def run(body, rig, args):
    """Adds the digit bones, and writes the rows of the claw vertices."""
    if args:
        raise ValueError('The step takes no arguments.')
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for name, (head, tail) in DIGITS.items():
        if name in rig.data.edit_bones:
            raise ValueError(f'The rig already has the bone {name}.')
        eb = rig.data.edit_bones.new(name)
        eb.head, eb.tail = Vector(head), Vector(tail)
        eb.parent = rig.data.edit_bones[f'fingers_{name[-1]}']
        eb.use_connect = False
        eb.use_deform = True
        eb.align_roll(Vector(sa.hint(rig, name).tolist()))
    bpy.ops.object.mode_set(mode='OBJECT')
    for name in DIGITS:
        rig.pose.bones[name].rotation_mode = 'QUATERNION'
    names = {g.index: g.name for g in body.vertex_groups}
    count, odd = 0, []
    for side, groups in ROWS.items():
        seg = f'forearm_seg3_{side}'
        for row, vertices in groups:
            for v in vertices:
                old = {names[g.group]: g.weight for g in body.data.vertices[v].groups}
                keep = old.get(seg, 0.0)
                if any(n.startswith(('clavicle', 'upper_arm')) for n in old):
                    odd.append(v)
                new = {name: w * (1 - keep) for name, w in row.items()}
                sa.set_weight_row(body, v, {**new, seg: keep} if keep > 0 else new)
                count += 1
    print(f'added {len(DIGITS)} digit bones and {count} claw rows')
    print(f'claw vertices with a clavicle or upper arm share before: {odd}')
