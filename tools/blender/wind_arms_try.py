"""Runs the session of `wind_arms.py` with changes of the weights or of the rings, for a try.

A try of the weights of a rebuilt arm repeats the whole session with a few changes, and writes
`<animal>-arms.glb` and `<animal>-weights.json` into a folder of its own. Test the files with one
variant: `pnpm rig-mesh <animal> --check --set 'source=<glb>;paintedWeights=<json>'`.

Run it in a terminal from the root of the tree:

    blender -b --factory-startup -P tools/blender/wind_arms_try.py -- <animal> <out dir> '<JSON>'

The JSON object of the changes takes these keys, each optional:

- `helper`: the length of the elbow and the wrist helpers (`armSegments.helper`), in units.
- `paint`: a value for each key of the paint of the session, such as the band of a fix.
- `spec`: a value for each key of the settings of the animal (`ANIMALS` of `wind_arms.py`).
- `ring`: the places of more rings at each elbow, in gaps from the joint: a negative place is on
  the side of the upper arm, and a positive place on the side of the forearm.
- `hinge`: `{"reach", "band", "repeat", "gain"}`. Remove From Group of the bones of the other side
  of each elbow joint, then Smooth `repeat` times.
- `ramp`: `{"reach", "upper", "fore", "repeat", "helper"}`. A ramp of the elbow turn from `upper`
  on the side of the upper arm to `fore` on the side of the forearm, then Smooth on the ramp.
- `helperShift`: `{"shift", "length"}`. Move the elbow helper of the Blender bind along the forearm,
  with a new length, so that the bone heat centers it there.
"""

import importlib.util
import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
path = os.path.join(HERE, 'wind_arms.py')
spec = importlib.util.spec_from_file_location('wind_arms', path)
wa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wa)
va = wa.va

argv = sys.argv[sys.argv.index('--') + 1 :]
animal, out_dir = argv[0], os.path.abspath(argv[1])
changes = json.loads(argv[2]) if len(argv) > 2 else {}
os.makedirs(out_dir, exist_ok=True)
va.clear_scene()
s = wa.Session(animal, out_dir)
if 'helper' in changes:
    s.config['armSegments']['helper'] = changes['helper']
for key, value in changes.get('paint', {}).items():
    s.spec['paint'][key] = value
for key, value in changes.get('spec', {}).items():
    s.spec[key] = value
print('wind_arms_try: changes', json.dumps(changes))

ORIG_STATIONS = wa.arm_stations


def ring_stations(s, line):
    """Gives the stations of an arm with more rings at the elbow, at the `ring` gaps from the joint.
    A negative place is on the side of the upper arm, with the axis of the upper arm. A positive
    place is on the side of the forearm, with the axis of the forearm."""
    out = ORIG_STATIONS(s, line)
    a, e, w, t = line
    u, f = (e - a).normalized(), (w - e).normalized()
    g = s.units(s.spec['gap'])
    j = next(i for i, (p, _) in enumerate(out) if (p - e).length < 1e-9)
    ups = sorted(o for o in changes['ring'] if o < 0)
    downs = sorted(o for o in changes['ring'] if o > 0)
    new = (
        out[:j]
        + [(e + u * (o * g), u) for o in ups]
        + [out[j]]
        + [(e + f * (o * g), f) for o in downs]
        + out[j + 1 :]
    )
    return new


if 'ring' in changes:
    wa.arm_stations = ring_stations


def step_hinge(s, hinge):
    """Removes the bones of the other side of each elbow joint from the vertices, then smooths."""
    mesh, fr = s.mesh, s.fr
    joints = s.config['joints']
    rule = s.config.get('proportions')

    def src(name):
        p = joints[name]['head']
        return wa.source_point(p, rule) if rule else p

    reach = hinge['reach'] * fr.height
    band = hinge['band'] * fr.height
    for side, k in (('L', 1), ('R', -1)):
        a, e, w = (fr.point(src(n), k) for n in ('upper_arm_L', 'forearm_L', 'hand_L'))
        n = ((e - a).normalized() + (w - e).normalized()).normalized()
        near = lambda p: (p.co - e).length < reach
        va.paint_mode(mesh, lambda p: near(p) and (p.co - e).dot(n) < -band)
        va.remove_from(mesh, [f'forearm_seg{i}_{side}' for i in range(4)])
        bpy.ops.object.vertex_group_normalize_all(
            group_select_mode='BONE_DEFORM', lock_active=False
        )
        va.paint_mode(mesh, lambda p: near(p) and (p.co - e).dot(n) > band)
        va.remove_from(mesh, [f'upper_arm_seg{i}_{side}' for i in range(4)])
        bpy.ops.object.vertex_group_normalize_all(
            group_select_mode='BONE_DEFORM', lock_active=False
        )
        gain = hinge.get('gain', 1.0)
        if gain != 1.0:
            va.paint_mode(mesh, lambda p: near(p) and abs((p.co - e).dot(n)) <= band)
            vg = mesh.vertex_groups
            vg.active_index = vg[f'elbow_{side}'].index
            bpy.ops.object.vertex_group_levels(group_select_mode='ACTIVE', offset=0.0, gain=gain)
            bpy.ops.object.vertex_group_normalize_all(
                group_select_mode='BONE_DEFORM', lock_active=True
            )
        if hinge.get('repeat', 0):
            va.paint_mode(mesh, near)
            bpy.ops.object.vertex_group_smooth(
                group_select_mode='BONE_DEFORM', factor=0.5, repeat=hinge['repeat']
            )
        va.limit_and_normalize()
        bpy.ops.object.mode_set(mode='OBJECT')
    mesh.data.use_paint_mask_vertex = False
    return 'hinge done'


def step_ramp(s, ramp):
    """Makes a ramp of the elbow turn from `-upper` on the side of the upper arm to `fore` on the
    side of the forearm of each elbow joint, in units along the bisector of the joint. Before
    `-upper`, it removes the forearm segments and the helper. After `fore` and within `reach`,
    it removes the upper segments. Then it smooths `repeat` times on the ramp only."""
    mesh, fr = s.mesh, s.fr
    joints = s.config['joints']
    rule = s.config.get('proportions')

    def src(name):
        p = joints[name]['head']
        return wa.source_point(p, rule) if rule else p

    reach = ramp['reach'] * fr.height
    up = ramp['upper'] * fr.height
    down = ramp['fore'] * fr.height
    for side, k in (('L', 1), ('R', -1)):
        a, e, w = (fr.point(src(n), k) for n in ('upper_arm_L', 'forearm_L', 'hand_L'))
        n = ((e - a).normalized() + (w - e).normalized()).normalized()
        near = lambda p: (p.co - e).length < reach
        va.paint_mode(mesh, lambda p: near(p) and (p.co - e).dot(n) < -up)
        drop = [f'forearm_seg{i}_{side}' for i in range(4)]
        if ramp.get('helper', True):
            drop.append(f'elbow_{side}')
        va.remove_from(mesh, drop)
        bpy.ops.object.vertex_group_normalize_all(
            group_select_mode='BONE_DEFORM', lock_active=False
        )
        va.paint_mode(mesh, lambda p: near(p) and (p.co - e).dot(n) > down)
        va.remove_from(mesh, [f'upper_arm_seg{i}_{side}' for i in range(4)])
        bpy.ops.object.vertex_group_normalize_all(
            group_select_mode='BONE_DEFORM', lock_active=False
        )
        if ramp.get('repeat', 0):
            va.paint_mode(mesh, lambda p: near(p) and -up <= (p.co - e).dot(n) <= down)
            bpy.ops.object.vertex_group_smooth(
                group_select_mode='BONE_DEFORM', factor=0.5, repeat=ramp['repeat']
            )
        va.limit_and_normalize()
        bpy.ops.object.mode_set(mode='OBJECT')
    mesh.data.use_paint_mask_vertex = False
    return 'ramp done'


ORIG_SKELETON = wa.step_skeleton


def shifted_skeleton(s):
    """Moves the elbow helper of the Blender bind `shift` units along the forearm, with a length of
    `length` units, so that the bone heat centers it there."""
    rig = ORIG_SKELETON(s)
    shift = changes['helperShift']
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for side in 'LR':
        bone = rig.data.edit_bones[f'elbow_{side}']
        fore = rig.data.edit_bones[f'forearm_{side}']
        axis = (fore.tail - fore.head).normalized()
        middle = fore.head + axis * s.units(shift['shift'])
        half = axis * s.units(shift['length']) / 2
        bone.head, bone.tail = middle - half, middle + half
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


if 'helperShift' in changes:
    wa.STEPS = tuple(shifted_skeleton if f is wa.step_skeleton else f for f in wa.STEPS)

steps = list(wa.STEPS)
last = steps[-1]
wa.run_steps(s, 0, len(steps) - 1)
if 'hinge' in changes:
    print('step_hinge:', step_hinge(s, changes['hinge']))
if 'ramp' in changes:
    print('step_ramp:', step_ramp(s, changes['ramp']))
print('%s: %s' % (last.__name__, last(s)))
print('wind_arms_try: wrote into', out_dir)
