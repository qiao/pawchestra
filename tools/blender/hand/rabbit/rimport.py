"""Import of the fourth Tripo rabbit: sa.import_source() only. The FBX already faces -y of Blender, so
no turn is needed: the rabbit faces -y, and +x is its left side."""

import studio_armature as sa


def import_rabbit(path, weld):
    return sa.import_source(path, weld)
