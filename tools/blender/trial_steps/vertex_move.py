"""A step of `pnpm rig-trial` (`tools/blender/rig_trial.py`): moves vertices of the bind.

    pnpm rig-trial <animal> <role> <tag> tools/blender/trial_steps/vertex_move.py \
        -- <ids> <dx>,<dy>,<dz> [<key>]

Each vertex of `<ids>` (such as `1901` or `1615,1529`) moves by the vector in the bind, in the
units and the Blender axes of the file (the animal faces -Y). The move goes into the shape key
`<key>` (default `bind_lap`) by the inverse of the skin (`add_bind_move()` of
`tools/blender/bind_edit.py`).
"""

import numpy as np

import bind_edit as be


def run(body, rig, args):
    """Moves the vertices of the arguments, and prints the largest move."""
    if len(args) not in (2, 3):
        raise ValueError('Arguments: <ids> <dx>,<dy>,<dz> [<key>]')
    ids = [int(v) for v in args[0].split(',')]
    vector = np.array([float(v) for v in args[1].split(',')])
    key = args[2] if len(args) == 3 else 'bind_lap'
    p = be.bind_points(body)
    move = np.zeros_like(p)
    move[ids] = vector
    count = be.add_bind_move(body, rig, move, key)
    after = be.bind_points(body)
    gap = np.abs(after - p - move).max()
    print(f'moved {count} vertices by {vector.tolist()} into {key}; largest gap {gap:.2e} u')
