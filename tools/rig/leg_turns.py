# Output: the `bind.legTurns` value of a rig config of `tools/mesh-rigs/`.
"""Gives the leg turns of a seat with the thighs sloped down, the shins slanted forward, and the
soles flat, for a config of `pnpm rig-mesh` (`bind.legTurns`): the world turn of each left leg
bone from the seated bind pose to the source, as a quaternion (x, y, z, w). The thigh points
forward, `down` degrees below the level and `out` degrees out to the left. The shin points down
and `slant` degrees forward of vertical, in the plane of y and z, so that the knee angle from the
side is 90 degrees plus `slant` plus `down`. The foot and the toes keep the turn of the source,
so the soles stay flat on the floor. With the optional `heel` angle, the foot turns that many
degrees about the x axis with the heel up, and the toes keep the turn of the source, so the
body sits higher on a higher seat and the toes stay flat on the floor. The printed knee angle
includes the slope of the thigh. The seat `hip-open` is `leg_turns.py <config> 15 8 23.8`. Usage:

    uv run --no-project --with numpy python -I tools/rig/leg_turns.py <config.json> <down degrees> <out degrees> <slant degrees> [<heel degrees>]
"""
import json
import math
import sys

import numpy as np


def unit(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


def swing_quat(a, b):
    """Gives the smallest turn (x, y, z, w) from the unit vector a onto the unit vector b."""
    a, b = unit(a), unit(b)
    axis = np.cross(a, b)
    s, c = np.linalg.norm(axis), float(np.dot(a, b))
    if s < 1e-12:
        return [0.0, 0.0, 0.0, 1.0]
    half = math.atan2(s, c) / 2
    k = axis / s * math.sin(half)
    return [float(k[0]), float(k[1]), float(k[2]), math.cos(half)]


config = json.load(open(sys.argv[1]))
down, out, slant = (math.radians(float(a)) for a in sys.argv[2:5])
heel = math.radians(float(sys.argv[5])) if len(sys.argv) > 5 else 0.0
joints = config['joints']
hip, knee, ankle = (np.array(joints[n]['head'], float) for n in ('thigh_L', 'shin_L', 'foot_L'))
bind_thigh = [math.sin(out) * math.cos(down), -math.sin(down), math.cos(out) * math.cos(down)]
bind_shin = [0.0, -math.cos(slant), math.sin(slant)]
turns = {
    'thigh': swing_quat(bind_thigh, knee - hip),
    'shin': swing_quat(bind_shin, ankle - knee),
    # The bind foot is the source foot turned about +x by `heel` (the toes down), so the turn
    # from the bind to the source is the turn by -heel.
    'foot': [-math.sin(heel / 2) if heel else 0.0, 0.0, 0.0, math.cos(heel / 2)],
    'toes': [0.0, 0.0, 0.0, 1.0],
}
src_shin = unit(ankle - knee)
print(f'source shin {np.round(src_shin, 4)} '
      f'({math.degrees(math.atan2(src_shin[2], -src_shin[1])):.1f} deg forward of vertical), '
      f'bind shin {np.round(bind_shin, 4)}, knee angle from the side '
      f'{90 + math.degrees(slant) + math.degrees(down):.1f} deg')
print(json.dumps({k: [round(x, 6) for x in v] for k, v in turns.items()}))
