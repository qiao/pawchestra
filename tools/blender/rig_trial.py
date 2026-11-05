"""Runs one step of a hand rig trial on a `.blend` file, and saves the file (`pnpm rig-trial`).

    blender -b --factory-startup --python-exit-code 1 --python tools/blender/rig_trial.py -- \
        <file.blend> <step.py> [<step args>...]

The contract of a step: `<step.py>` is a Python file with a function `run(body, rig, args)`.
`body` is the mesh object of the body, `rig` the armature object, and `args` the list of the
step arguments as text. Before the call, the file is open, and the rig and the mesh are in the
bind of the export (`pose_bind()` of `tools/blender/bind_edit.py`). The step changes the data of
the open file, such as a shape key `bind*`, a vertex, or a weight. It does not save, open, or
close a file, because this script saves the file after the call. It can import the modules of
`tools/blender/`, such as `bind_edit` and `studio_armature`. The step prints its own lines, and
this script gives each one the prefix `step: `. An exception stops the script with the exit
code 1, before the save.

After the call, the script puts back the action, the frame, the bone transforms, and the key
values of before. Thus the saved file differs from the open file only by the change of the step.
"""

import contextlib
import importlib.util
import io
import os
import sys
import time
import traceback

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bind_edit as be  # noqa: E402


def say(text):
    """Prints a line of the script."""
    print(f'rig_trial: {text}', flush=True)


def fail(text):
    """Prints a fault and stops with the exit code 1, with no save."""
    print(f'rig_trial: error: {text}', file=sys.stderr, flush=True)
    sys.exit(1)


def load_step(path):
    """Loads a step file as a module, and gives its function `run`."""
    spec = importlib.util.spec_from_file_location('rig_trial_step', path)
    if spec is None or spec.loader is None:
        fail(f'The step {path} is not a Python file.')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    run = getattr(module, 'run', None)
    if not callable(run):
        fail(f'The step {path} has no function run(body, rig, args).')
    return run


def main():
    """Opens the file, runs the step in the bind, and saves the file in place."""
    rest = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else []
    if len(rest) < 2:
        fail('Usage: rig_trial.py -- <file.blend> <step.py> [<step args>...]')
    blend, step, args = os.path.abspath(rest[0]), os.path.abspath(rest[1]), rest[2:]
    if not os.path.isfile(blend):
        fail(f'The file {blend} does not exist.')
    if not os.path.isfile(step):
        fail(f'The step {step} does not exist.')

    bpy.ops.wm.open_mainfile(filepath=blend)
    try:
        body, rig = be.objects()
    except ValueError as error:
        fail(str(error))
    restore = be.pose_bind(body, rig)
    start = time.monotonic()
    out = io.StringIO()
    try:
        with contextlib.redirect_stdout(out):
            load_step(step)(body, rig, list(args))
    except SystemExit:
        raise
    except Exception:
        for line in out.getvalue().splitlines():
            print(f'step: {line}', flush=True)
        fail(f'The step {step} failed:\n{traceback.format_exc()}')
    for line in out.getvalue().splitlines():
        print(f'step: {line}', flush=True)
    if os.path.abspath(bpy.data.filepath) != blend:
        fail(f'The step opened another file ({bpy.data.filepath}), so nothing is saved.')
    restore()

    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=blend)
    say(f'ran {os.path.basename(step)} {" ".join(args)} in {time.monotonic() - start:.2f} s')
    say(f'saved {blend}')


if __name__ == '__main__':
    main()
