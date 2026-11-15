"""Import of the new Tripo cat: sa.import_source(). The FBX faces -y of Blender, so it takes no
turn: +x is its left side."""

import body_armature as sa


def import_source_body(path, weld):
    return sa.import_source(path, weld)
