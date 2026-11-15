"""Import of the new Tripo fox (the source with 4-digit front paws): sa.import_source(). The FBX
faces -y of Blender, so it takes no turn: +x is its left side."""

import body_armature as sa


def import_fox(path, weld):
    return sa.import_source(path, weld)
