"""Frees the arms of a copy of the badger mesh from the trunk (design 4.4, "Source meshes").

The inner side of each upper arm of `badger.glb` joins the side of the trunk from the shoulder to
about half of the upper arm, with folded faces in the crease. `arm_rebuild.py` then finds the
first closed loop around the upper arm only at half of the upper arm, and the long thin faces
between the trunk and that loop fold when an arm lifts. This script frees each arm in a copy,
`badger-edit.glb`, with the steps of `beaver_edit.py` and the values of the badger below, so that
`arm_rebuild.py` starts the tube near the shoulder joint:

1. Import the source and Merge by Distance (`violin_arms.import_mesh()`).
2. Remove the flap face of the left armpit (`FLAPS`), which holds the only open edges of the
   source, and split the edges of the crease where the arm meets the trunk (`SEAMS`,
   `beaver_edit.step_rip()`).
3. Turn the arm out about the forward axis through the shoulder joint, and shift it out and up,
   with a ramp along the upper arm (`beaver_edit.step_turn()`).
4. Close the arm and the trunk, smooth the pockets and the old crease, and round the inner side
   of the arm (`beaver_edit.step_fill()` to `step_round()`).
5. Give the new faces the fur colors beside them (`beaver_edit.step_color()`), and write the copy.

The script prints the joints of the left arm of the rig config after the turn
(`beaver_edit.turned_joints()`). `SOURCE_ARM` keeps the joints of the source mesh.

Run it in a terminal from the root of the tree:

    blender -b --factory-startup -P tools/blender/badger_edit.py -- <out.glb>

Two runs give the same bytes: the script runs Blender again with `PYTHONHASHSEED=0`, as
`beaver_edit.py` does.
"""

import json
import os
import subprocess
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import beaver_edit as be  # noqa: E402

ar, va = be.ar, be.va

#: The seam of each arm: the chain of concave edges where the arm meets the trunk, from the back
#: of the shoulder, down the back crease, through the folded faces of the armpit, and up the front
#: crease. It is the shortest edge path that prefers the concave edges (an edge costs 0.3 of its
#: length when its faces turn more than 12° inward, and 3 times its length else). Each end lies
#: within 0.03 of the upper arm from the shoulder joint, so that the flood of the arm stops at the
#: seam (`FLOOD`). Vertex indices of the welded source (`violin_arms.import_mesh()`).
SEAMS = {
    1: [536, 541, 540, 546, 537, 539, 538, 533, 532, 527, 524, 526, 496, 497, 495, 493, 484, 485],
    -1: [641, 643, 642, 639, 640, 1319, 645, 649, 651, 652, 653, 654, 629, 626, 623, 622, 587, 583],
}

#: The flap face of the source on the left seam: its edge 524-496 has three faces, and its two
#: other edges are open.
FLAPS = ((523, 524, 496),)

#: The turn of each arm out from the trunk, in degrees, and its shift out and up, in units. A
#: smaller turn keeps the look of the hanging arms of the source.
TURN = 8.0
SHIFT = 0.012

#: The shares of the upper arm over which the turn grows from 0 to its full angle, and the share
#: of the upper arm from which the flood of the arm starts (`beaver_edit.arm_region()`). With the
#: flood from the shoulder joint, the arm joins the trunk around the ends of the seam.
RAMP = (0.05, 0.4)
FLOOD = 0.05

#: The two copies of a seam vertex do not join again: a join where the arm moves less than
#: `beaver_edit.JOIN` pinches the hole into two loops.
JOIN = 0.0

#: The joints of the left arm of the source mesh, in the units of the studio: the joints of the
#: rig config before the edit. The config holds the joints of the turned arms.
SOURCE_ARM = {
    'upper_arm_L': {'head': [0.14, 0.575, -0.02]},
    'forearm_L': {'head': [0.212, 0.49, 0.016]},
    'forearm_twist_L': {'head': [0.2345, 0.4455, 0.048]},
    'hand_L': {'head': [0.257, 0.401, 0.08]},
    'fingers_L': {'head': [0.2775, 0.3604, 0.1092], 'tail': [0.27, 0.3208, 0.1147]},
}


def session():
    """Gives a session of `arm_rebuild.py` on the source mesh of the badger, with the arm joints
    of the source (`SOURCE_ARM`)."""
    s = ar.Session('badger', source='assets/models/badger/badger.glb')
    for name, joint in SOURCE_ARM.items():
        s.joints[name] = dict(s.joints[name], **joint)
    return s


def use_badger():
    """Puts the values of the badger into `beaver_edit.py`, whose steps read them."""
    be.SEAMS, be.FLAPS, be.TURN, be.SHIFT = SEAMS, FLAPS, TURN, SHIFT
    be.RAMP, be.FLOOD, be.JOIN = RAMP, FLOOD, JOIN


def main():
    """Runs the steps on the source mesh, writes the copy, and prints the joints of the left arm
    for the rig config."""
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if len(argv) != 1:
        raise SystemExit('Usage: blender -b --factory-startup -P tools/blender/badger_edit.py -- '
                         '<out.glb>')
    if sys.flags.hash_randomization:
        # A fixed string hash gives the same order of each set and dict on each run.
        env = dict(os.environ, PYTHONHASHSEED='0')
        code = subprocess.call([bpy.app.binary_path, '-b', '--factory-startup',
                                '--python-use-system-env', '--python', os.path.abspath(__file__),
                                '--', *argv], env=env)
        raise SystemExit(code)
    use_badger()
    va.clear_scene()
    s = session()
    va.import_mesh(s)
    for step in be.STEPS:
        print('badger_edit: %s: %s' % (step.__name__, step(s)))
    size = be.step_export(s, os.path.abspath(argv[0]))
    print('badger_edit: wrote %s, %d bytes' % (argv[0], size))
    joints = be.turned_joints(s.joints, 1.0)
    print('badger_edit: joints %s' % json.dumps({'%s.%s' % k: v for k, v in joints.items()}))


if __name__ == '__main__':
    main()
