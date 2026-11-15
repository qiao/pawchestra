"""Import of the new Tripo wolf: sa.import_source(), with an optional turn about Z so that the wolf
faces -y and +x is its left side."""

import math

from mathutils import Matrix

import body_armature as sa

TURN = 0.0


def import_fox(path, weld):
    body = sa.import_source(path, weld)
    if TURN:
        body.data.transform(Matrix.Rotation(TURN, 4, 'Z'))
        body.data.update()
    return body
