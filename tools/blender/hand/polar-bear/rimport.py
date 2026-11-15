"""Import of the new Tripo polar bear: sa.import_source(). The FBX faces -y of Blender after the
import, and +x is the left side of the bear, so no turn is necessary."""

import body_armature as sa


def import_fox(path, weld):
    return sa.import_source(path, weld)
