"""A step of `pnpm rig-trial` (`tools/blender/rig_trial.py`): takes the wrist helper off the paws.

    pnpm rig-trial polar-bear pianist <tag> tools/blender/trial_steps/paw_wrist_off.py

Automatic weights give each paw vertex up to about 0.6 of the wrist helper `wrist_<side>`, so the
paw turns only about two thirds of the hand turn in the play. The step gives the wrist share of
each paw vertex to `hand_<side>`. A paw vertex has a share of `hand_<side>` or `fingers_<side>`
and lies past the wrist ring (`PAW_FROM`). The vertices of the wrist ring keep their row
{`wrist`: 0.6, `hand`: 0.4} (weight step 8 of `assets/models/polar-bear/README.md`), so the
wrist helper blends only in its own ring. The other shares of each row stay. In the bind, the
wrist helper and the paw have the same turn, so no vertex of the bind moves.
"""

import studio_armature as sa

#: The distance from the middle plane, in units, past which a vertex with a paw share is a paw
#: vertex. The ring at the paw side of the wrist starts at 0.4496.
PAW_FROM = 0.445

#: The row of the wrist ring (weight step 8).
RING = {'wrist': 0.6, 'hand': 0.4}


def is_ring(row, side):
    """True for the row of the wrist ring."""
    keys = {f'{name}_{side}': w for name, w in RING.items()}
    return set(row) == set(keys) and all(abs(row[n] - w) < 1e-3 for n, w in keys.items())


def run(body, rig, args):
    """Gives the wrist share of each paw vertex to the paw, and prints the changed vertices."""
    if args:
        raise ValueError('The step takes no arguments.')
    names = {g.index: g.name for g in body.vertex_groups}
    for side, sign in (('L', 1), ('R', -1)):
        wrist, hand, fingers = f'wrist_{side}', f'hand_{side}', f'fingers_{side}'
        changed, rings, largest = [], 0, 0.0
        for v in body.data.vertices:
            row = {names[g.group]: g.weight for g in v.groups if g.weight > 0}
            if v.co.x * sign < PAW_FROM or not (row.get(hand) or row.get(fingers)):
                continue
            if is_ring(row, side):
                rings += 1
                continue
            share = row.pop(wrist, 0.0)
            if share <= 0:
                continue
            row[hand] = row.get(hand, 0.0) + share
            sa.set_weight_row(body, v.index, row)
            changed.append(v.index)
            largest = max(largest, share)
        print(
            f'{side}: {len(changed)} paw vertices lose the wrist share (up to {largest:.3f}), '
            f'{rings} ring vertices keep it: {",".join(str(i) for i in changed)}'
        )
