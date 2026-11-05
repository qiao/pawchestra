"""Rigs a textured mesh with no skeleton into the GLB format of a studio body (design 4.4).

    blender -b --factory-startup --python tools/blender/rig_mesh.py -- <config.json> <out.glb> \
        [--preview <dir>] [--obj <file>] [--faces <file>] [--corners <file>] [--check]

`pnpm rig-mesh <animal>` runs this script with `tools/mesh-rigs/<animal>.json`. `pnpm studio-body`
reads the output ("The asset chain" of `docs/agents/rigging.md`). The steps:

1. Import the source GLB file, weld the corners, and scale the mesh to 1 unit from the soles to
   the top, with the soles at y = 0. The math uses the axes of the studio: y up, +z forward, and
   +x the left side of the animal. With `proportions` of the config, the mesh then takes a factor
   on each axis (`width` on x, `height` on y, `depth` on z), so that a body can be shorter or
   wider than the source mesh before the joints. With `keep` of the rule set to `head`, the
   head keeps its form, and a blend zone at the neck joins it to the scaled body
   (`proportioned()`). The head keeps its size, or takes the factor `head` of the rule on each
   axis. With `cut` of the config, the faces that join each hanging
   forearm to the belly go, and new faces close both holes (`cut_seam()`). With `fins` of the
   cut, each kept face that sticks into the hole with two edges also goes (`cut_fins()`), so
   that no cap repeats it. A copy of the mesh
   that removed these faces and closed the arm itself leaves only the hole of the trunk open,
   and the cut closes that hole (`open_loop()`). With `skinNormals` of
   the cut, the file names the caps of the arm, and the app gives them the normals of the skin.
   With `bodyNormals`, the sides of the cut such as "R", the file also names the caps of the body,
   the quads at the top, and the skin faces of their rim (`cut_rim()`) of these sides, which take
   the normals of the skin too. With `rootNormals` of the config, the rim also takes the skin
   faces within its radius of each shoulder joint, and within its `elbow` radius of each elbow
   joint, and with `armShare` only the faces that the clavicle and the arm move (`root_rim()`).
   With `knee`, it takes the leg faces within that radius behind each knee joint. With `wrist`,
   it takes the arm faces of a band from before each wrist joint to past it on the paw.
   With `turn`, a face whose corner takes a skin normal more than `turn` degrees from its own
   face in the final bind keeps the crease normals (`rim_turns()`).
2. Give each face one color from the base color texture. A face of an eye keeps its dark color.
3. Build the skeleton of the 30 body bones of the studio at the joints of the config, with the
   optional bone `tail_tip` for a tail of two bones and the optional bone `jaw` for a beak that
   opens, and give the weights with bone heat. With `heatSource`, a vertex at a place of that
   mesh takes its bone heat (`kept_heat()`). Then the rules of the config: the free arm (beyond a plane, which `armFree` turns around the vertical
   for a thick arm that joins the trunk, with each island inside the plane that only the free arm
   surrounds with `armIslands`, and only the arm bones on a free arm that is a tube of its own
   with `armOwn`), the chest share of the inner root of a cut arm (`armRoot`),
   the clavicles below the shoulders and the arms up the neck,
   the clavicles over the top of the shoulders (`shoulderRamp`), the paw, the head and the
   shoulders, the ears, the lower beak on the jaw (`jaw`), a long nose in front of the chest
   (`noseFront`), the tail (a ball on one
   tail bone, or a ramp along a tail of two bones), the split of the thigh and the shin across
   the knee (`knee`), the haunch, one set of weights for the corners of each short thin face, and the weights of the
   line for the middle corner of each long thin face. Each vertex
   keeps four bones, in steps of 1/255. With `smooth` of the config, the vertices inside a box
   first move toward the middle of their neighbors (`smooth_box()`), before the weights. The file
   then gives the move of the head center back to the head before the smoothing (`head_shift()`),
   so that the holds keep their places. With `paintedWeights`, the weights come from a file of
   Blender. With `weightSource`, a mesh before a planar split of some faces, the steps give the
   weights of that mesh, and each vertex takes the weights of its place on it
   (`placed_weights()`), so that the split moves no weight.
4. Make the upper arm and the forearm longer by the arm factor of the config, and the thigh and
   the shin by the leg factor. Each bone scales along its axis, and the weights blend the stretch
   to 0 at the shoulder and at the hip. The paws and the feet keep their size, and the body rises
   so that the soles stay at y = 0. The head and the ears grow by the head factor around the neck
   joint, and the weights blend the growth over the neck. The trunk takes the trunk factor
   between the hips joint and the neck joint, or the joint of `trunkTop` (`trunk_moves()`), and
   the head and the arms move with it and keep their sizes. The legs and the tail keep their
   places. The trunk and the clavicles take the girth
   factors across the trunk axis, one for the width and one for the depth (`girth_moves()`), and
   the arms, the legs, and the tail move out with their joints and keep their sizes. With
   `girthProfile`, the width and the depth in front of and behind the axis change with the
   height along the trunk axis. With
   `armGirth` of the config, the upper arm and the forearm take its factors across their axes
   before the skin (`arm_girth()`): the factor of the upper arm fades in from the shoulder joint,
   and the factor of the forearm fades out to the wrist, so that the shoulders and the paws keep
   their form. With `legGirth`, the thigh and the shin take its factors across their axes in the
   same way (`leg_girth()`), so that a thigh that the leg factor makes long does not look thin.
   The vertices of the tail keep their places by their tail weights.
5. Change the faces of the arms and the legs so that they bend at the joints: with `pointFlip`
   the edge at each of its points flips first (`point_flips()`), then a ring of new
   vertices at each joint of the config splits the faces that it crosses, and the long edge of a
   face that is thin in the seated bind pose flips. Each face then takes its color from the
   texture again.
6. Pose the skeleton in the seated bind pose: the legs turn by the seat of the config, the arms
   go to the bind arms of the studio, and the bones of a tail of two bones go to the bind
   directions of the config, back through the open back of the chair. The skin of the
   long-armed source in this pose is the bind mesh: a linear blend, or with `bind.blend` of
   the config a dual quaternion blend at the arm roots, with `bind.knee` at the knees, and with
   `bind.arm` on the lower arms (`bind_skin()`). Where the pose turns
   faces over, as at the haunch, their vertices relax toward their neighbors. The log then gives the gap from the
   lowest point of the haunch behind the hips joint to the seat top, and above 5 cm a warning
   with a front edge of the chair that puts the seat under the haunch (`haunch_gap()`). With
   `sit` of the config, the underside of the haunch behind the hip joints goes down onto the seat
   (`sit()`). With `studio.trunk`,
   the trunk then reclines: the pelvis turns back around the head of the hips until the hip
   angle opens by `open` degrees (`trunk_turn()`), or forward for a negative `open`, each trunk
   bone takes its share of the turn,
   the haunch and the root of the tail rise onto the seat top with a `sit` rule
   (`seat_lift()`), and the tip of a
   tail of two bones keeps the height of its end. With `crease`, the bind is smoothed across the
   crease where the belly meets the top of each thigh (`crease_relax()`), with `crease.lap` a
   second time up the belly front, and with `kneeCrease`
   across the crease at the back of each knee (`knee_relax()`). With `kneeCrease.fair`, the calf
   back is then faired along the vertex normals (`calf_fair()`). With `sitPose` of the config, a
   body that binds standing also gets the sit pose of a seated bind with the same steps
   (`sit_pose()`): the legs turn by `sitPose.legTurns`, and the rules `sit`, `crease`, and
   `kneeCrease` of `sitPose` put the haunch on the seat of `sitPose.chair` and relax the creases.
   The trunk, the arms, and the tail keep the bind.
7. Put a gloss shell over each eye: a fan from the middle of the eye to the edge of its dark
   faces, a little out of the surface. `pnpm studio-body` finds each eye by its fan, drops the
   fan, and puts the pea eye of the app at its place (design 4.5). The faces of the nose become
   gloss. A mesh with no nose of its own, such as the hippo with its two nostrils, has no
   `noseBox`, and its faces keep the fur. The log gives each dark patch that an eye box takes only in part, and warns when the
   box takes more than half of it (`eye_patches()`). Each face takes the nearest color of a
   palette in Oklab. Then each face of the old eye
   (the dark faces and the faces near them, such as the white of the eye, `old_eye_faces()`) takes
   the color with the largest area in the ring of faces around the old eye (`recolor_old_eyes()`),
   so that no outline of the old eye shows. Each patch of dark faces near an old eye that no old
   eye holds, such as the end of the upper lid line of the fox, takes the color of its own ring in
   the same way (`dark_faces_near()`). With `colors.tone`, the plain fur moves in Oklab
   (`tone()`). With `colors.border`, each dark face of a box whose texture is mostly light takes
   the color of the nearest light face (`border_faces()`). Then `colors.patch` makes each eye
   patch round (`patch_shape()`), `colors.belly` makes a light belly patch an even oval by the
   share of the area of each face in the oval (`belly_patch()`), and `colors.smile` draws a smile
   line in the dark of the patches, or in its own `color` (`smile_line()`). Last, `colors.shift`
   moves the faces of a colored fur in Oklch
   (`shift_colors()`). The faces go in the order of a walk over their shared edges.
8. Find the corrective shapes: the move of each vertex in the bind pose that the skin of the clip
   `reference` takes to the source place. The arm vertices give `arm_down_L` and `arm_down_R`,
   and the other vertices give `legs_straight_L` and `legs_straight_R`. With `raise` of the
   config, the shape of each rule follows, such as `arm_raise_R` (`raise_rules()`): the move
   that relaxes the faces which the skin turns over in the pose of the rule (`raise_shape()`).
   `raise` holds one rule, or a list of up to four rules for a raised arm or a bent wrist.
   With `spread`, the move of single vertices of the shape spreads over their neighbors
   (`spread_shape()`). With `follow`, the skin near its points first moves a share of the way
   with the upper arm in the pose of the rule, as the front of a joined arm root does when the
   arm rises, and with `follow.fill` its valleys then fill (`fill_valleys()`). A rig with
   `armSegments` turns its segments and helpers in the pose of a rule. With `upperTwist` of the
   config, the solve of each shape gives each upper arm the twist bone of the app
   (`upper_twist()`), and the file names the share for `pnpm studio-body`. With `sitPose`, the
   shapes `sit_L` and `sit_R` follow: the move of each vertex in the bind pose that the skin of
   the clip `sit` takes to its place in the sit pose (`sit_shapes()`).
9. Write the GLB file with the code of this script: the materials `fur` and `gloss`, the skinned
   mesh with its morph targets, the skeleton, the clip `reference` with one key, the clip `sit` of
   a sit pose, and the facts that `pnpm studio-body` reads in the extras of the asset. The file
   holds only the animal. The seat under the seated body or under the sit pose is numbers in the
   extras (`seat_extras()`). When `colors.shift` moves a face, `COLOR_1` holds the colors before
   the shift, from which `pnpm studio-body` maps the other palettes. The bytes depend only on the
   config and the source file.

With `--preview`, the script also renders the seated bind on its chair and the standing body from
four sides, the knees of the seated body from the side, the neck from four sides, and the main bone
of each face, and with `sitPose` the sit pose on its chair from four sides and its knees,
and it writes the long-armed source as `source-long-arms.obj` for the probes. With `--obj`, it
writes only the long-armed source, into the file, for `pnpm rig-mesh --check`. With `--check`, it
also lists the faces that the stretch turns or squeezes (`stretch_faces()`) and the long thin faces
across an arm joint that no ring cuts (`uncut_faces()`), before the fold probe of the check. It
gives the share of the dark faces outside the eye and nose boxes, and warns above `DARK_SHARE` with
a dark limit that brings the share under it (`dark_check()`). The flag changes no byte of the rig.
With `--faces`, it also writes the middle of each face of the module in the units of the source into
the file as JSON (`face_sources()`), for `pnpm fold-probe --faces`. With `--corners`, it writes the
corners of the source face of each face of the module, in the source and in the long-armed source
(`face_corners()`), for `pnpm arm-look`.
"""

import colorsys
import json
import math
import os
import struct
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

#: The body bones of a studio body, in parent order (`STUDIO_BONES` of
#: `src/models/studio-format.ts`, with no eye bones).
BONES = (
    'root', 'hips', 'spine', 'spine1', 'chest', 'neck', 'head', 'ear_L', 'ear_R',
    'clavicle_L', 'upper_arm_L', 'forearm_L', 'forearm_twist_L', 'hand_L', 'fingers_L',
    'clavicle_R', 'upper_arm_R', 'forearm_R', 'forearm_twist_R', 'hand_R', 'fingers_R',
    'thigh_L', 'shin_L', 'foot_L', 'toes_L', 'thigh_R', 'shin_R', 'foot_R', 'toes_R', 'tail',
)

#: The optional bone of a tail of two bones (`OPTIONAL_STUDIO_BONES` of
#: `src/models/studio-format.ts`). A config with a joint `tail_tip` adds it after the body bones.
TAIL_TIP = 'tail_tip'

#: The optional bone of a jaw that opens a beak (`OPTIONAL_STUDIO_BONES` of
#: `src/models/studio-format.ts`), a child of the head at the hinge of the beak. A config with a
#: joint `jaw` adds it after the body bones and the tail tip, and its rule `weights.jaw` gives the
#: lower part of the beak to it.
JAW = 'jaw'

#: The parent of each body bone (`STUDIO_PARENTS` of `src/models/studio-format.ts`).
PARENTS = {
    'root': None, 'hips': 'root', 'spine': 'hips', 'spine1': 'spine', 'chest': 'spine1',
    'neck': 'chest', 'head': 'neck', 'ear_L': 'head', 'ear_R': 'head', 'clavicle_L': 'chest',
    'upper_arm_L': 'clavicle_L', 'forearm_L': 'upper_arm_L', 'forearm_twist_L': 'forearm_L',
    'hand_L': 'forearm_twist_L', 'fingers_L': 'hand_L', 'clavicle_R': 'chest',
    'upper_arm_R': 'clavicle_R', 'forearm_R': 'upper_arm_R', 'forearm_twist_R': 'forearm_R',
    'hand_R': 'forearm_twist_R', 'fingers_R': 'hand_R', 'thigh_L': 'hips', 'shin_L': 'thigh_L',
    'foot_L': 'shin_L', 'toes_L': 'foot_L', 'thigh_R': 'hips', 'shin_R': 'thigh_R',
    'foot_R': 'shin_R', 'toes_R': 'foot_R', 'tail': 'hips', TAIL_TIP: 'tail', JAW: 'head',
}

#: The arm bones of each side, from the shoulder out. The clavicle does not move.
ARM = ('upper_arm', 'forearm', 'forearm_twist', 'hand', 'fingers')

#: The arm bones that keep the turn of the upper arm in the bind with `studio.straightArms`
#: (`bind_turns()`), so that the elbow and the wrist of the bind keep the angles of the source.
STRAIGHT_ARM = ('forearm', 'hand')

#: The share of the twist from the forearm to the paw that the forearm twist bone takes, as
#: `TWIST_SHARE` of `src/models/studio-rig.ts`.
TWIST_SHARE = 0.5

#: The places along the upper arm, from 0 at the shoulder joint to 1 at the elbow, between which
#: the weight of the upper arm moves from its twist bone to the upper arm bone, as
#: `UPPER_TWIST_SPAN` of `src/models/studio-rig.ts`.
UPPER_TWIST_SPAN = (0.1, 0.9)

#: The leg bones of each side, from the hips down.
LEG = ('thigh', 'shin', 'foot', 'toes')

#: The trunk bones from the hips joint up to the neck joint, which the trunk factor shortens
#: (`trunk_moves()`).
TRUNK = ('hips', 'spine', 'spine1', 'chest')

#: The share of the upper arm from the shoulder joint over which the factor of the cross-section
#: of the upper arm (`armGirth` of the config) grows from 0 to all (`arm_girth()`), so that the
#: shoulder and the side of the trunk next to the shoulder joint keep their form.
ARM_GIRTH_FADE = 0.4

#: The share of the upper arm before the elbow joint and of the forearm after it over which the
#: factor of the upper arm changes to the factor of the forearm (`arm_girth()`), so that the
#: elbow has no step.
ARM_GIRTH_ELBOW = 0.15

#: The share of the thigh above the hip joint over which the factor of the cross-section of the
#: thigh (`legGirth` of the config) grows from 0 to all (`leg_girth()`), so that the haunch on
#: the seat keeps its form, and the share of the shin over which it falls to 0 below the knee.
LEG_GIRTH_FADE = 0.4

#: The least distance of the inner side of a widened thigh from the middle plane, in units
#: (`leg_girth()`), so that the two thighs do not cross.
LEG_GIRTH_GAP = 0.01

#: The bones whose vertices the girth factors widen around the trunk axis (`girth_moves()`): the
#: trunk bones and the clavicles, which hold the tops of the shoulders.
GIRTH = TRUNK + ('clavicle_L', 'clavicle_R')

#: The largest number of bones of a vertex, and the steps of a weight (design 4.4).
INFLUENCES = 4
WEIGHT_STEPS = 255

#: The corrective shapes, in their order in the mesh (`tools/studio-body.ts`). The clip
#: `reference` gives each one its full weight. A config with `raise` adds the shape of each rule
#: after them, with the weight 0 in that clip (`raise_rules()`).
SHAPES = ('arm_down_L', 'arm_down_R', 'legs_straight_L', 'legs_straight_R')

#: The largest number of rules of `raise` of a config: the shapes of a raised arm or of a bent
#: wrist of one body (`STUDIO_RAISES` of `src/models/studio-format.ts`).
RAISE_LIMIT = 4

#: The roughness of each material, as the materials of the studio rabbit.
MATERIALS = (('fur', 0.7), ('gloss', 0.42))

#: The color of the chair of the preview images, in sRGB.
CHAIR_COLOR = (0.55, 0.42, 0.3)

#: The size of one view of a preview, in pixels.
VIEW = 500

#: The radius of a ring with no `radius`, as a part of the length of the arm part that ends at its
#: joint (`ring_radius()`). The ring of 0.13 units at each elbow of the rabbit with the arm factor
#: 1.81 is 0.75 of its upper arm, so a ring of this part grows with the arm factor.
RING_PART = 0.75

#: The arm joints of the check of the faces across a joint (`uncut_faces()`): the bone that starts
#: at the joint, and the name of the joint.
ARM_JOINTS = (('upper_arm', 'shoulder'), ('forearm', 'elbow'), ('hand', 'wrist'))

#: The turn of the normal of a face from the source to the long-armed source, in degrees, above
#: which the check lists the face (`stretch_faces()`).
STRETCH_TURN = 45.0

#: The part of the shortest edge of a face that the long-armed source keeps, below which the check
#: lists the face (`stretch_faces()`).
STRETCH_EDGE = 0.5

#: The gap from the lowest point of the haunch to the seat top before the sit, in meters, above
#: which the log warns that the thighs set the seat top (`haunch_gap()`). With short thighs, the
#: seat top of the panda goes 6.8 cm below the haunch, and the sit pulls the haunch down into a
#: sheet behind the seat.
SEAT_WARNING = 0.05

#: The step of the front edge of the chair that the warning of the seat proposes, in units.
FRONT_STEP = 0.005

#: The share of the faces that may be dark outside the eye and nose boxes, above which the check
#: warns (`dark_check()`). The dark limit 0.05 made 890 of the 3,119 faces of the wolf dark, most
#: of its dark gray fur, and 0.02 made 117.
DARK_SHARE = 0.05


def log(text):
    """Prints a line that `tools/rig-mesh.ts` shows."""
    print(f'rig_mesh: {text}', flush=True)


def warn(text):
    """Prints a warning line of the log, which starts with `rig_mesh: warning:`."""
    log(f'warning: {text}')


def args():
    """Reads the config path, the output path, the preview folder, the OBJ file, the JSON files of
    the face sources and of the face corners, and the flag `--check` after `--`."""
    rest = sys.argv[sys.argv.index('--') + 1 :]
    check = '--check' in rest
    rest = [arg for arg in rest if arg != '--check']
    options = {'--preview': None, '--obj': None, '--faces': None, '--corners': None}
    for flag in options:
        if flag in rest:
            at = rest.index(flag)
            options[flag] = rest[at + 1]
            rest = rest[:at] + rest[at + 2 :]
    if len(rest) != 2:
        raise SystemExit('Usage: blender -b --python rig_mesh.py -- <config> <out.glb> '
                         '[--preview <dir>] [--obj <file>] [--faces <file>] [--corners <file>] '
                         '[--check]')
    return (rest[0], rest[1], options['--preview'], options['--obj'], options['--faces'],
            options['--corners'], check)


def to_blender(v):
    """Converts points from the axes of the studio (y up, z forward) to the axes of Blender."""
    v = np.asarray(v, float)
    return np.stack([v[..., 0], -v[..., 2], v[..., 1]], axis=-1)


def from_blender(v):
    """Converts points from the axes of Blender to the axes of the studio."""
    v = np.asarray(v, float)
    return np.stack([v[..., 0], v[..., 2], -v[..., 1]], axis=-1)


def unit(v):
    """Gives a vector of length 1 in the direction of a vector."""
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


def smoothstep(x, low, high):
    """Gives 0 below `low`, 1 above `high`, and a smooth ramp between them, for arrays."""
    t = np.clip((np.asarray(x, float) - low) / (high - low), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def quat_matrix(q):
    """Gives the rotation matrix of a quaternion (x, y, z, w)."""
    x, y, z, w = unit(q)
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ])


def matrix_quat(m):
    """Gives the quaternion (x, y, z, w) of a rotation matrix, with w >= 0."""
    t = np.trace(m)
    if t > 0:
        s = math.sqrt(t + 1.0) * 2
        q = [(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, 0.25 * s]
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = math.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
        q = [0.25 * s, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s, (m[2, 1] - m[1, 2]) / s]
    elif m[1, 1] > m[2, 2]:
        s = math.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
        q = [(m[0, 1] + m[1, 0]) / s, 0.25 * s, (m[1, 2] + m[2, 1]) / s, (m[0, 2] - m[2, 0]) / s]
    else:
        s = math.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
        q = [(m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, 0.25 * s, (m[1, 0] - m[0, 1]) / s]
    q = unit(q)
    return q if q[3] >= 0 else -q


def swing(a, b):
    """Gives the smallest rotation matrix that turns the unit vector `a` onto the unit vector `b`."""
    a, b = unit(a), unit(b)
    axis = np.cross(a, b)
    s = np.linalg.norm(axis)
    c = float(np.dot(a, b))
    if s < 1e-9:
        return np.eye(3)
    k = axis / s
    kx = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + s * kx + (1 - c) * kx @ kx


def mirror_name(name):
    """Gives the name of the bone on the other side, or the name of a bone of the middle."""
    if name.endswith('_L'):
        return name[:-2] + '_R'
    if name.endswith('_R'):
        return name[:-2] + '_L'
    return name


def mirrored(v):
    """Mirrors a point or a direction to the other side of the middle plane."""
    return np.array([-v[0], v[1], v[2]], float)


def load_mesh(config):
    """Imports the source GLB file, welds the corners, and gives the vertices (axes of the studio,
    1 unit high, soles at y = 0, then scaled on each axis by `proportions`), the triangles, the UV
    of each corner, and the base color texture."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=config['source'])
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if len(meshes) != 1:
        raise SystemExit(f"{config['source']} has {len(meshes)} meshes, not 1.")
    ob = meshes[0]
    material = ob.material_slots[0].material
    bsdf = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    image = bsdf.inputs['Base Color'].links[0].from_node.image
    width, height = image.size
    pixels = np.empty(width * height * 4, np.float32)
    image.pixels.foreach_get(pixels)
    texture = pixels.reshape(height, width, 4)[:, :, :3]

    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.transform(ob.matrix_world)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=config['weld'])
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    uv_layer = bm.loops.layers.uv.active
    verts = from_blender(np.array([v.co[:] for v in bm.verts]))
    tris = np.array([[v.index for v in f.verts] for f in bm.faces], np.int64)
    uvs = np.array([[loop[uv_layer].uv[:] for loop in f.loops] for f in bm.faces])
    bm.free()
    # The scene keeps only the objects of the rig and of the previews.
    for o in list(bpy.context.scene.objects):
        bpy.data.objects.remove(o)
    floor, top = verts[:, 1].min(), verts[:, 1].max()
    scale = 1.0 / (top - floor)
    verts = (verts - [0.0, floor, 0.0]) * scale
    log(f'source: {len(verts)} vertices, {len(tris)} triangles, scale {scale:.6f}')
    if 'soften' in config:
        verts = softened(verts, tris, config['soften'])
    # `proportions` scales the source on each axis around the middle of the soles: x by `width`,
    # y by `height`, and z by `depth`. The soles stay at y = 0, and the joints and the boxes of the
    # config are in the units of the scaled source.
    rule = config.get('proportions')
    if rule:
        verts = proportioned(verts, rule)
        log(f'proportions: the source takes the factors {proportion_factors(rule).tolist()} '
            f'(width, height, depth), and is {verts[:, 1].max():.4f} u high')
    return verts, tris, uvs, texture


def softened(verts, tris, rule):
    """Softens the sharp creases in a box of the source (`soften` of the config, in the units of
    the source before `proportions`, x as |x|). Each vertex of an edge whose two faces meet at more
    than `angle` degrees, with the middle of the edge in `box`, moves `share` of the way to the mean
    of its neighbors, in each of `rounds` rounds, and no vertex moves more than `most` units in
    all. Without the soften, the crease of the brow ridge of the wolf over each eye goes down to
    the outer side and shades as a sad brow in each light."""
    normals = face_normals(verts, tris)
    faces_of = edge_faces(tris)
    lo, hi = np.asarray(rule['box'][0]), np.asarray(rule['box'][1])
    chosen = set()
    for (a, b), faces in faces_of.items():
        if len(faces) != 2:
            continue
        middle = (verts[a] + verts[b]) / 2.0
        middle[0] = abs(middle[0])
        if not (np.all(middle >= lo) and np.all(middle <= hi)):
            continue
        cos = float(np.clip(normals[faces[0]].dot(normals[faces[1]]), -1.0, 1.0))
        if math.degrees(math.acos(cos)) > rule['angle']:
            chosen.update((a, b))
    near = {v: set() for v in chosen}
    for t in tris:
        for k in range(3):
            if int(t[k]) in near:
                near[int(t[k])].update(int(t[j]) for j in range(3) if j != k)
    order = sorted(chosen)
    start = verts.copy()
    for _ in range(rule['rounds']):
        means = np.array([verts[sorted(near[v])].mean(axis=0) for v in order])
        verts = verts.copy()
        verts[order] += rule['share'] * (means - verts[order])
        moved = verts[order] - start[order]
        length = np.linalg.norm(moved, axis=1, keepdims=True)
        verts[order] = start[order] + moved * np.minimum(1.0, rule['most'] / np.maximum(length,
                                                                                       1e-12))
    moves = np.linalg.norm(verts - start, axis=1)
    log(f'soften: {len(order)} vertices of the creases in the box move to the mean of their '
        f'neighbors, the largest move {moves.max():.4f} u')
    return verts


def proportion_factors(rule):
    """Gives the factors of the `proportions` of a config on x, y, and z, 1 when not given."""
    return np.array([rule.get('width', 1), rule.get('height', 1), rule.get('depth', 1)], float)


def proportioned(verts, rule):
    """Scales the source (1 unit high, soles at y = 0) by the `proportions` of a config.

    Each vertex takes the factors of the rule around the middle of the soles. With `keep` set to
    `head`, the head keeps its form: above the upper height of `blend`, each vertex moves with the
    point (0, upper height, 0) and takes the factor `head` (1 when not given) on each axis around
    that point. From the lower height to the upper height, the share of the kept place grows with
    a smoothstep, so that the scaled neck joins the head with no tear. The heights of `blend` are
    in the units of the source before the factors."""
    factors = proportion_factors(rule)
    scaled = verts * factors
    if rule.get('keep') != 'head':
        return scaled
    low, high = rule['blend']
    anchor = np.array([0.0, high, 0.0])
    head = rule.get('head', 1)
    # With the factor 1, the sum keeps the order of the sum of the head kept at its size.
    kept = verts * head + anchor * factors - anchor * head
    share = smoothstep(verts[:, 1], low, high)
    blend = int(((share > 0) & (share < 1)).sum())
    log(f"proportions: the head keeps its form above y {high} u with the factor "
        f"{head}, with a blend from y {low} u: "
        f'{int((share >= 1).sum())} vertices kept, {blend} in the blend')
    share = share[:, None]
    return scaled * (1.0 - share) + kept * share


def linear(srgb):
    """Converts sRGB values from 0 to 1 to linear values."""
    srgb = np.asarray(srgb, float)
    return np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)


def sample_grid(n):
    """Gives the barycentric weights of the texture samples of a face: a grid of `n` steps."""
    return np.array([(i / n, j / n, (n - i - j) / n) for i in range(n + 1) for j in range(n + 1 - i)])


def face_samples(uv, grid, texture):
    """Gives the sRGB texture samples of one face at the weights of `grid` (`sample_grid()`)."""
    height, width, _ = texture.shape
    at = grid @ uv
    x = np.clip(((at[:, 0] % 1.0) * width).astype(int), 0, width - 1)
    y = np.clip(((at[:, 1] % 1.0) * height).astype(int), 0, height - 1)
    return texture[y, x]


def luminance(samples):
    """Gives the linear luminance of sRGB samples."""
    return linear(samples) @ [0.2126, 0.7152, 0.0722]


def face_colors(tris, uvs, texture, rules):
    """Gives the sRGB color of each face, a flag for each dark face, and the share of the dark
    samples of each face. A face with a share of dark samples of at least `eyeShare` is dark, and
    takes the mean of its dark samples. Each other face takes the mean of its samples that are
    not dark, so that the black gaps between the islands of the texture do not darken a face at
    the edge of an island. With `split` (an Oklab lightness), a face whose samples spread over more
    than `split` takes the mean of the larger of its light and dark halves, cut at the middle of
    the spread. Without the split, a face across a sharp edge of the texture takes the mean of
    black and white, and the faces of the edge show as a gray band."""
    grid = sample_grid(rules['samples'])
    colors = np.zeros((len(tris), 3))
    dark = np.zeros(len(tris), bool)
    share = np.zeros(len(tris))
    for f in range(len(tris)):
        samples = face_samples(uvs[f], grid, texture)
        lum = luminance(samples)
        low = lum < rules['dark']
        share[f] = low.mean()
        if share[f] >= rules['eyeShare']:
            dark[f] = True
            colors[f] = samples[low].mean(axis=0)
            continue
        kept = samples[~low]
        if 'split' in rules:
            light = oklab(kept)[:, 0]
            if np.ptp(light) > rules['split']:
                upper = light >= (light.min() + light.max()) / 2
                kept = kept[upper] if upper.sum() * 2 >= len(kept) else kept[~upper]
        colors[f] = kept.mean(axis=0)
    return colors, dark, share


def dark_ranks(tris, uvs, texture, rules):
    """Gives for each face the linear luminance of its sample at the rank of `eyeShare`: the
    smallest count of dark samples that makes a face dark (`face_colors()`). A face is dark when
    this value is below the dark limit, so each limit gives its count of dark faces with no new
    samples."""
    grid = sample_grid(rules['samples'])
    n = len(grid)
    rank = max(1, next((c for c in range(n + 1) if c / n >= rules['eyeShare']), n))
    ranks = np.zeros(len(tris))
    for f in range(len(tris)):
        ranks[f] = np.sort(luminance(face_samples(uvs[f], grid, texture)))[rank - 1]
    return ranks


def feature_boxes(centers, rules):
    """Tells for each face center if it is in the eye box of a side or in the nose box."""
    box = np.asarray(rules['eyeBox'], float)
    right_box = [[-box[1][0], box[0][1], box[0][2]], [-box[0][0], box[1][1], box[1][2]]]
    inside = in_box(centers, box) | in_box(centers, right_box)
    if 'noseBox' in rules:
        inside |= in_box(centers, rules['noseBox'])
    return inside


def dark_check(centers, dark, ranks, rules):
    """Warns when more than `DARK_SHARE` of the faces are dark outside the eye and nose boxes
    (`feature_boxes()`), such as dark fur near the dark limit, and gives the dark limit that
    brings the share under it. A face whose flag the limit does not set, such as a cap of the
    arm cut, keeps its flag."""
    outside = ~feature_boxes(centers, rules)
    count = int((dark & outside).sum())
    share = count / len(dark)
    text = (f'colors: {count} of {len(dark)} faces ({share * 100:.1f}%) are dark outside the eye '
            f"and nose boxes, with the dark limit {rules['dark']}")
    if share <= DARK_SHARE:
        log(text)
        return
    follows = (ranks < rules['dark']) == dark
    free = np.sort(ranks[outside & follows])
    fixed = int((dark & outside & ~follows).sum())
    allowed = int(np.floor(DARK_SHARE * len(dark))) - fixed
    limit = math.floor(free[max(0, allowed)] * 1e4) / 1e4
    found = fixed + int((free < limit).sum())
    warn(f'{text}, above {DARK_SHARE * 100:.0f}%. A dark face takes the mean of its dark samples. '
         f'The dark limit {limit:.4f} makes {found} faces dark ({found / len(dark) * 100:.1f}%)')


def oklab(srgb):
    """Converts sRGB colors from 0 to 1 to Oklab (Björn Ottosson, 2020)."""
    rgb = linear(srgb)
    lms = rgb @ np.array([[0.4122214708, 0.5363325363, 0.0514459929],
                          [0.2119034982, 0.6806995451, 0.1073969566],
                          [0.0883024619, 0.2817188376, 0.6299787005]]).T
    return np.cbrt(lms) @ np.array([[0.2104542553, 0.7936177850, -0.0040720468],
                                    [1.9779984951, -2.4285922050, 0.4505937099],
                                    [0.0259040371, 0.7827717662, -0.8086757660]]).T


def srgb_of_oklab(lab):
    """Converts Oklab colors back to sRGB colors from 0 to 1."""
    lms = lab @ np.array([[1.0, 0.3963377774, 0.2158037573],
                          [1.0, -0.1055613458, -0.0638541728],
                          [1.0, -0.0894841775, -1.2914855480]]).T
    rgb = (lms ** 3) @ np.array([[4.0767416621, -3.3077115913, 0.2309699292],
                                 [-1.2684380046, 2.6097574011, -0.3413193965],
                                 [-0.0041960863, -0.7034186147, 1.7076147010]]).T
    rgb = np.clip(rgb, 0.0, 1.0)
    return np.where(rgb <= 0.0031308, rgb * 12.92, 1.055 * rgb ** (1 / 2.4) - 0.055)


def palette(colors, size, rounds=40):
    """Gives each face a color of a palette of at most `size` colors: k-means in Oklab, a uniform
    color space, so that a step of the palette looks the same in each hue. The first centers are
    the farthest colors from each other, so that the small features (the eyes, the nose, the
    inner ears, the whiskers) get centers of their own. Gives the new sRGB colors and the largest
    and the mean Oklab distance of a face from its palette color."""
    lab = oklab(colors)
    centers = [lab[int(np.argmin(np.linalg.norm(lab - lab.mean(axis=0), axis=1)))]]
    near = np.linalg.norm(lab - centers[0], axis=1)
    while len(centers) < min(size, len(lab)):
        centers.append(lab[int(np.argmax(near))])
        near = np.minimum(near, np.linalg.norm(lab - centers[-1], axis=1))
    centers = np.array(centers)
    for _ in range(rounds):
        label = np.argmin(np.linalg.norm(lab[:, None] - centers[None], axis=2), axis=1)
        for k in range(len(centers)):
            if (label == k).any():
                centers[k] = lab[label == k].mean(axis=0)
    label = np.argmin(np.linalg.norm(lab[:, None] - centers[None], axis=2), axis=1)
    error = np.linalg.norm(lab - centers[label], axis=1)
    return srgb_of_oklab(centers)[label], float(error.max()), float(error.mean())


def tone(colors, main_bone, rule):
    """Moves the faces of the plain fur in Oklab (`colors.tone` of the config), so that a fur
    that the warm stage light colors keeps the look of its sheet. A face takes the move when its
    Oklab chroma is at most `chroma`, its lightness is below `light` (the move fades to 0 over
    the range), and its main bone is not one of `keep`: the pink nose and inner ears have more
    chroma, and the white paws and whiskers keep their colors. The move (lightness, a, b) is the
    linear blend of the rows of `points` by the lightness of the face, as [L, dL, da, db], and
    the move of the first or the last row outside them. Gives the new colors and the count of
    the moved faces."""
    lab = oklab(colors)
    points = np.asarray(rule['points'], float)
    keep = [BONES.index(b) for b in BONES if b.rsplit('_', 1)[0] in rule['keep']]
    chroma = np.hypot(lab[:, 1], lab[:, 2])
    share = ((chroma <= rule['chroma']) & ~np.isin(main_bone, keep)) * (
        1.0 - smoothstep(lab[:, 0], *rule['light']))
    for k in range(3):
        lab[:, k] += share * np.interp(lab[:, 0], points[:, 0], points[:, k + 1])
    return srgb_of_oklab(lab), int((share > 0).sum())



def shift_colors(colors, fur, rule):
    """Moves the faces of a colored fur in Oklch (`colors.shift` of the config), so that the fur
    takes the hue, the chroma, and the lightness of its reference, such as the red-orange of the
    reference red fox. A fur face takes the move by its share: the smoothstep of its Oklab chroma
    over the range `chroma`, times the smoothstep of its lightness over the range `light`. Thus
    the white, the black, and the gloss faces keep their colors, and a face between them takes a
    part of the move. The move multiplies the lightness and the chroma by the factors of `scale`
    and turns the hue by `turn` degrees, each by the share. A moved color outside the sRGB gamut
    keeps its lightness and its hue, and takes the largest chroma inside the gamut
    (`gamut_chroma()`): a clip of each channel would turn the hue. A face whose Oklch color does
    not change keeps its sRGB color. Gives the new colors, the count of the moved faces, and the
    count of the faces that the gamut limits."""
    lab = oklab(colors)
    chroma = np.hypot(lab[:, 1], lab[:, 2])
    hue = np.arctan2(lab[:, 2], lab[:, 1])
    share = fur * smoothstep(chroma, *rule['chroma']) * smoothstep(lab[:, 0], *rule['light'])
    light = lab[:, 0] * (1.0 + share * (rule['scale'][0] - 1.0))
    new_chroma = chroma * (1.0 + share * (rule['scale'][1] - 1.0))
    new_hue = hue + share * math.radians(rule['turn'])
    moved = (light != lab[:, 0]) | (new_chroma != chroma) | (new_hue != hue)
    limit = gamut_chroma(light, new_hue)
    limited = moved & (new_chroma > limit)
    new_chroma = np.where(limited, limit, new_chroma)
    new = np.stack([light, new_chroma * np.cos(new_hue), new_chroma * np.sin(new_hue)], axis=1)
    out = colors.copy()
    out[moved] = srgb_of_oklab(new[moved])
    return out, int(moved.sum()), int(limited.sum())


def gamut_chroma(light, hue, rounds=40):
    """Gives the largest Oklch chroma inside the sRGB gamut at each lightness and hue (radians),
    by bisection."""
    low, high = np.zeros_like(light), np.full_like(light, 0.5)
    m = np.array([[1.0, 0.3963377774, 0.2158037573],
                  [1.0, -0.1055613458, -0.0638541728],
                  [1.0, -0.0894841775, -1.2914855480]])
    back = np.array([[4.0767416621, -3.3077115913, 0.2309699292],
                     [-1.2684380046, 2.6097574011, -0.3413193965],
                     [-0.0041960863, -0.7034186147, 1.7076147010]])
    for _ in range(rounds):
        mid = 0.5 * (low + high)
        lab = np.stack([light, mid * np.cos(hue), mid * np.sin(hue)], axis=1)
        rgb = ((lab @ m.T) ** 3) @ back.T
        inside = (rgb.min(axis=1) >= 0.0) & (rgb.max(axis=1) <= 1.0)
        low, high = np.where(inside, mid, low), np.where(inside, high, mid)
    return low

def border_faces(corners, colors, fur, share, rule, tris=None):
    """Gives the faces at the border of a black fur region the color of most of their texture
    (`colors.border` of the config). Each dark fur face (Oklab lightness below `dark`) with its
    center in `box`, whose share of dark texture samples (`face_colors()`) is below `share`,
    takes the color of the nearest light fur face. A face takes black from the share `eyeShare`
    of dark samples, so that the small dark faces of an eye stay dark. On the large faces of the
    torso of the panda, this gives the border of the black band teeth, and a raised arm stretches
    them into black wedges on the white side. `corners` gives the corners of each face in the
    units of the source (`head_source()`), with the stretch of the arm factor on the faces of the
    arms. With `teeth` of the rule, each dark fur face of the box with at least `teeth` light
    neighbors over its edges (`tris`) also takes the color of the nearest light fur face, after
    the share rule. The cut of the panda (`cut_seam()`) leaves such small black teeth at the old
    seam. With `gray` of the rule, each fur face of the box with an Oklab lightness from `dark` up
    to `gray` also takes the color of the nearest light fur face (lightness `gray` or more): a face
    across the edge of the black band of the panda takes the mean of its gray edge samples, and
    shows as a gray wedge under the arm. Gives the new colors and the changed faces."""
    centers = corners.mean(axis=1)
    lightness = oklab(colors)[:, 0]
    dark = lightness < rule['dark']
    inside = in_box(centers, rule['box'])
    changed = fur & dark & inside & (share < rule['share'])
    gray = fur & ~dark & inside & (lightness < rule.get('gray', 0.0))
    for f in np.nonzero(gray)[0]:
        log(f'border: the gray face at ({", ".join(f"{v:.4f}" for v in centers[f])}) u, '
            f'lightness {lightness[f]:.2f}')
    if 'teeth' in rule:
        across = {}
        for f, t in enumerate(tris):
            for i in range(3):
                across.setdefault(tuple(sorted((int(t[i]), int(t[(i + 1) % 3])))), []).append(f)
        still = dark & ~changed
        for f in np.nonzero(fur & still & inside)[0]:
            t = tris[f]
            light_sides = sum(1 for i in range(3) for g in across[tuple(sorted(
                (int(t[i]), int(t[(i + 1) % 3]))))] if g != f and not still[g])
            if light_sides >= rule['teeth']:
                changed[f] = True
    light = np.nonzero(fur & ~dark & ~gray)[0]
    changed |= gray
    out = colors.copy()
    for f in np.nonzero(changed)[0]:
        out[f] = colors[light[np.argmin(np.linalg.norm(centers[light] - centers[f], axis=1))]]
    return out, np.nonzero(changed)[0]


def head_source(points, pivot, factor, rise, drop):
    """Gives points of the head in the units of the source: the inverse of the move of the head
    of `moved_boxes()`. The face rules (`patch_shape()`, `smile_line()`) give their shapes in the
    source, as the eye box and the nose box do."""
    return pivot + (np.asarray(points) - drop - [0.0, rise, 0.0] - pivot) / factor


def patch_shape(corners, colors, fur, rule):
    """Makes each eye patch round (`colors.patch` of the config). Each dark fur face (Oklab
    lightness below `dark`) with its center in `box`, or in its mirror, and with a corner outside
    the ellipse of `radii` around `center` in the front plane (|x|, y), takes the color of the
    nearest light fur face that the rule does not change. The sharp upper inner point of the eye
    patch of the panda reads as raised inner brows, a sad face. `corners` gives the corners of
    each face in the units of the source (`head_source()`). Gives the new colors, the changed
    faces, and the most common color of the dark faces that stay in the boxes."""
    centers = corners.mean(axis=1)
    side = np.abs(centers) * [1.0, 0.0, 0.0] + centers * [0.0, 1.0, 1.0]
    in_patch = fur & in_box(side, rule['box'])
    dark = oklab(colors)[:, 0] < rule['dark']
    q = (np.abs(corners[:, :, :2]) * [1.0, 0.0] + corners[:, :, :2] * [0.0, 1.0]
         - rule['center']) / rule['radii']
    inside = (q ** 2).sum(axis=2).max(axis=1) <= 1.0
    changed = in_patch & dark & ~inside
    light = np.nonzero(fur & ~dark & ~changed)[0]
    out = colors.copy()
    for f in np.nonzero(changed)[0]:
        out[f] = colors[light[np.argmin(np.linalg.norm(centers[light] - centers[f], axis=1))]]
    kept, counts = np.unique(colors[in_patch & dark & inside], axis=0, return_counts=True)
    return out, np.nonzero(changed)[0], kept[np.argmax(counts)]


def belly_patch(corners, hips, neck, colors, fur, trunk, rule):
    """Makes the light belly patch an even oval (`colors.belly` of the config). `corners` gives
    the corners of each face in the stretched body, and `hips` and `neck` the joints of the trunk
    line there. A place on the trunk takes the share `f` of the line from the hips joint to the
    neck joint, and its distance `x` from the middle plane in units. The oval lies in the plane
    (x, f) around the share `center`, with the half width `radii[0]` in units, and the half
    heights `radii[1]` below and `radii[2]` above the center in shares. Each fur face of the trunk
    (`trunk`) in front of the line, with its center between the shares of `range`, takes part,
    by the share of its area in the oval (`sample_grid()`):

    - a face wholly in the oval keeps a light color (Oklab lightness `light` or more), or takes
      the color of the nearest light face in the oval;
    - a face wholly out of the oval keeps a darker color, or takes the color of the nearest
      darker face out of the oval;
    - a face across the edge of the oval takes the mix of those two colors by its share.

    The faces of the mesh are 3 cm to 6 cm across, so a choice of whole faces gives the outline
    teeth or a waist, and the mix gives an even edge. The texture of the cat gives a patch with a
    waist below the chest, and the seat shows it as a pinch. Gives the new colors and the changed
    faces."""
    centers = corners.mean(axis=1)
    up = neck - hips
    length = np.linalg.norm(up)
    up = up / length
    forward = np.array([0.0, 0.0, 1.0]) - up[2] * up
    forward /= np.linalg.norm(forward)
    left = np.cross(up, forward)
    grid = sample_grid(8)
    points = np.einsum('sk,fkd->fsd', grid, corners)
    rel = points - hips
    f = rel @ up / length - rule['center']
    q = ((rel @ left) / rule['radii'][0]) ** 2 + (f / np.where(f < 0, *rule['radii'][1:])) ** 2
    share = (q <= 1.0).mean(axis=1)
    rel = centers - hips
    low, high = rule['range']
    f = rel @ up / length
    part = fur & trunk & (rel @ forward > 0) & (f >= low) & (f <= high)
    light = oklab(colors)[:, 0] >= rule['light']
    lights = np.nonzero(part & (share == 1.0) & light)[0]
    darks = np.nonzero(part & (share == 0.0) & ~light)[0]

    def nearest(pool, face):
        return colors[pool[np.argmin(np.linalg.norm(centers[pool] - centers[face], axis=1))]]

    out = colors.copy()
    changed = []
    for face in np.nonzero(part)[0]:
        if share[face] == 1.0 and light[face] or share[face] == 0.0 and not light[face]:
            continue
        out[face] = (share[face] * nearest(lights, face)
                     + (1.0 - share[face]) * nearest(darks, face))
        changed.append(face)
    return out, np.array(changed, int)


def flank_faces(corners, colors, fur, arm_share, rule):
    """Gives the white of the side to the black band around a hanging arm (`colors.flank` of the
    config). The texture of the penguin paints its black flipper larger than the flipper of the
    mesh, so a band of black skin of the trunk surrounds the flipper at its front and below its
    tip. When the flipper rises to the folder, that band stays on the white side as a black tongue
    with a hook.
    `line` gives two points (height, forward) of the side view: the armpit and the lower side,
    where the white side meets the black back. Each fur face with |x| of at least `x`, its center
    between the two heights, forward of the line, an Oklab lightness below 0.5, and a mean share
    of the arm bones of its corners below `arm` takes the color of the nearest light fur face of
    the side. Gives the new colors and the changed faces."""
    centers = corners.mean(axis=1)
    (y0, z0), (y1, z1) = rule['line']
    t = np.clip((centers[:, 1] - y0) / (y1 - y0), 0.0, 1.0)
    edge = z0 + t * (z1 - z0)
    side = np.abs(centers[:, 0]) >= rule['x']
    between = (centers[:, 1] >= min(y0, y1)) & (centers[:, 1] <= max(y0, y1))
    light = oklab(colors)[:, 0] >= 0.5
    pick = np.nonzero(fur & side & between & ~light & (arm_share < rule['arm'])
                      & (centers[:, 2] > edge))[0]
    out = colors.copy()
    for face in pick:
        pool = np.nonzero(fur & light & side & (np.sign(centers[:, 0]) == np.sign(
            centers[face, 0])))[0]
        out[face] = colors[pool[np.argmin(np.linalg.norm(centers[pool] - centers[face], axis=1))]]
    return out, pick


def smile_line(corners, normals, colors, fur, rule, color):
    """Draws a smile line along the crease between the lips (`colors.smile` of the config). Each
    fur face that lies in a band of `bands` takes `color`, the dark of the eye patches. A face lies
    in a band when its |x| is in `x`, its center y is in `y` raised by `rise` × (|x| / the end of
    `x`)², its center z is at least `front`, the y of its normal is in `normalY`, and the z of its
    normal is at least `facing`. With `outward`, the x of its normal away from the middle plane is
    at most `outward` too: a face that turns to the side shows as a large dark area in a side
    view. A band on the lower lip gives the line, and a band on the underside of the upper lip
    can turn its corners up. The caller gives the `color` of the rule in place of the dark of the
    patches when the rule has one. `corners` and `normals` are in the units and the axes of the source
    (`head_source()`). Gives the new colors and the faces of each band."""
    centers = corners.mean(axis=1)
    x = np.abs(centers[:, 0])
    out_x = normals[:, 0] * np.sign(centers[:, 0])
    out = colors.copy()
    found = []
    for band in rule['bands']:
        lift = band['rise'] * (x / band['x'][1]) ** 2
        faces = (fur & (x >= band['x'][0]) & (x <= band['x'][1])
                 & (centers[:, 1] >= band['y'][0] + lift) & (centers[:, 1] <= band['y'][1] + lift)
                 & (centers[:, 2] >= band['front'])
                 & (normals[:, 1] >= band['normalY'][0]) & (normals[:, 1] <= band['normalY'][1])
                 & (normals[:, 2] >= band['facing']) & (out_x <= band.get('outward', 1.0)))
        out[faces] = color
        found.append(np.nonzero(faces)[0])
    return out, found


def locality_order(tris):
    """Gives an order of the faces in which each face follows a neighbor where it can: a walk
    from face to face over the shared edges, which goes back to the oldest face with a free
    neighbor when it stops. The export numbers the vertices in the order of their first face, so
    the packed corners and places of the app become small steps that pack well."""
    faces_of = {}
    for f, t in enumerate(tris):
        for k in range(3):
            faces_of.setdefault(tuple(sorted((int(t[k]), int(t[(k + 1) % 3])))), []).append(f)

    def free(f):
        t = tris[f]
        for k in (1, 2, 0):
            for g in faces_of[tuple(sorted((int(t[k]), int(t[(k + 1) % 3]))))]:
                if not seen[g]:
                    return g
        return None

    seen = np.zeros(len(tris), bool)
    order, oldest = [], 0
    for start in range(len(tris)):
        current = None if seen[start] else start
        while current is not None:
            seen[current] = True
            order.append(current)
            current = free(current)
            while current is None and oldest < len(order):
                current = free(order[oldest])
                if current is None:
                    oldest += 1
    return np.array(order)


def in_box(points, box):
    """Tells for each point if it is in a box of two corners."""
    lo, hi = np.asarray(box[0]), np.asarray(box[1])
    return np.all((points >= lo) & (points <= hi), axis=1)


def moved_boxes(rules, pivot, factor, rise, drop):
    """Gives the color rules with the eye box and the nose box of the source moved with the head:
    each box grows by the head factor around the neck joint, moves down the neck by the drop of
    the neck factor and of the trunk factor, then rises with the body. The vertices of the eyes
    and the nose follow the head only, so the faces in a box stay in it."""
    if factor == 1 and not rise and not drop.any():
        return rules
    out = dict(rules)
    for key in ('eyeBox', 'noseBox'):
        if key not in rules:
            continue
        box = np.asarray(rules[key], float)
        out[key] = (pivot + factor * (box - pivot) + drop + [0.0, rise, 0.0]).tolist()
    return out


def features(verts, tris, colors, dark, rules):
    """Finds the faces of the eyes, by side, and the faces of the nose."""
    centers = verts[tris].mean(axis=1)
    box = np.asarray(rules['eyeBox'], float)
    left = dark & in_box(centers, box)
    right_box = [[-box[1][0], box[0][1], box[0][2]], [-box[0][0], box[1][1], box[1][2]]]
    right = dark & in_box(centers, right_box)
    # The export takes each gloss shell out of the middle plane as an eye, so the two nostrils of
    # the hippo would be eyes: a mesh with no nose on the middle plane has no nose box.
    nose = np.zeros(len(tris), bool)
    if 'noseBox' in rules:
        nose_color = np.asarray(rules['nose'], float)
        pink = np.linalg.norm(colors - nose_color, axis=1) < np.linalg.norm(colors - 1.0, axis=1)
        nose = pink & in_box(centers, rules['noseBox'])
    log(f'eyes: {left.sum()} faces left, {right.sum()} faces right, nose: {nose.sum()} faces')
    return {'L': np.nonzero(left)[0], 'R': np.nonzero(right)[0]}, np.nonzero(nose)[0]


def eye_patches(tris, dark, eyes):
    """Finds the dark patches that an eye box takes only in part, such as the black eye patch
    of the panda around its eye: each patch of dark faces that share corners
    (`corner_patches()`) with faces of the eye and dark faces outside the eye box. A patch that
    the box takes whole is the eye itself. Gives for each side a list of the faces of the eye and
    the other faces of each such patch. When the box takes most of a patch, the color of the old
    eye (`recolor_old_eyes()`) leaves light holes in the patch."""
    patches = corner_patches(tris, np.nonzero(dark)[0])
    found = {}
    for side, faces in eyes.items():
        eye = set(int(f) for f in faces)
        found[side] = []
        for patch in patches:
            inside = [int(f) for f in patch if int(f) in eye]
            rest = [int(f) for f in patch if int(f) not in eye]
            if inside and rest:
                found[side].append((np.array(inside), np.array(rest)))
    return found


def lightness_text(colors):
    """Writes the Oklab lightness of a set of sRGB colors: the range and the median."""
    light = oklab(colors)[:, 0]
    return f'{light.min():.3f} to {light.max():.3f} (median {np.median(light):.3f})'


def joints_of(config):
    """Gives the head, the tail, the roll hint, and the child at the tail (or `None` for a tail
    at a point of its own) of each body bone, in the pose of the source. The right side mirrors
    the left side of the config."""
    joints = config['joints']
    palm = unit(config['palm'])
    heads, ends, rolls, children = {}, {}, {}, {}
    specs = {}
    for name in BONES:
        own = name in joints
        spec = joints[name] if own else joints[mirror_name(name)]
        side = (lambda v: np.asarray(v, float)) if own else mirrored
        specs[name] = (spec, own, side)
        heads[name] = side(spec['head'])
        roll = spec.get('roll', [0, 0, 1])
        rolls[name] = side(palm if roll == 'palm' else roll)
    for name in BONES:
        spec, own, side = specs[name]
        tail = spec['tail']
        if isinstance(tail, str):
            children[name] = tail if own else mirror_name(tail)
            ends[name] = heads[children[name]]
        else:
            children[name] = None
            ends[name] = side(tail)
    return heads, ends, rolls, children


def frame(head, tail, roll):
    """Gives the rotation of a bone frame: y along the bone, z toward the roll hint, x = y × z."""
    y = unit(np.asarray(tail) - head)
    z = np.asarray(roll, float) - np.dot(roll, y) * y
    z = unit(z)
    return np.stack([np.cross(y, z), y, z], axis=1)


# The bones of the lower body: with `paintedLower` set to `rules`, the vertices on them keep the
# weights of the rules (`main()`). A list of bone names in `paintedLower` replaces them.
LOWER_BONES = ('root', 'hips', 'thigh_L', 'shin_L', 'foot_L', 'toes_L', 'thigh_R', 'shin_R',
               'foot_R', 'toes_R', 'tail', 'tail_tip')


def painted_below(verts, weights, heads, rule):
    """Gives the trunk under each armpit a part of the painted weights of the arm (`paintedBelow`
    of the weights of the config). The weights of Blender give the side of the trunk under the
    root of a T-pose arm only the clavicle and the arm, so a raised arm pulls the side up and out,
    and the trunk under it looks cut in. Within `inner` units of the middle plane, the share of the
    clavicle and arm weights that a vertex keeps grows from 0 at the lower height of `height` to 1
    at the upper height, and the trunk bone at the height of the vertex (the spine1 below the head
    of the chest, else the chest) takes the rest. Gives the new weights."""
    w = weights.copy()
    low, high = rule['height']
    keep = smoothstep(verts[:, 1], low, high)
    chest = np.where(verts[:, 1] >= heads['chest'][1], BONES.index('chest'),
                     BONES.index('spine1'))
    for side, sign in (('L', 1.0), ('R', -1.0)):
        arm = [k for k, b in enumerate(BONES)
               if b.endswith(f'_{side}') and b.split('_')[0] in ('clavicle', 'upper', 'forearm',
                                                                   'elbow')]
        inside = (verts[:, 0] * sign > 0) & (verts[:, 0] * sign <= rule['inner'])
        rows = np.nonzero(inside & (keep < 1.0) & (w[:, arm].sum(axis=1) > 0))[0]
        taken = w[rows][:, arm] * (1.0 - keep[rows])[:, None]
        w[rows[:, None], arm] -= taken
        w[rows, chest[rows]] += taken.sum(axis=1)
        log(f'painted below {side}: {len(rows)} vertices of the trunk under the armpit give '
            f'{taken.sum():.1f} of arm weight to the trunk, at most '
            f'{taken.sum(axis=1).max() if len(rows) else 0:.2f}')
    # A vertex with four arm bones gets the trunk bone as a fifth bone. The glTF skin holds four,
    # so such a vertex keeps its four largest weights. The other vertices stay as they are.
    over = np.nonzero((w > 1e-4).sum(axis=1) > INFLUENCES)[0]
    if len(over):
        w[over] = limit(w[over])
        log(f'painted below: {len(over)} vertices with a fifth bone keep the four largest weights')
    return w


def painted_weights(verts, path):
    """Reads the weights that a rigger painted in Blender (`paintedWeights` of the config), for
    each welded vertex of the source. The file holds the bone names, the place of each painted
    vertex in the units of the studio, and its weights. Each source vertex takes the weights of
    the painted vertex at its place.

    The arm rebuild of the polar bear paints its weights with the tools of Blender
    (`tools/blender/polar_bear_arms.py`).
    """
    with open(path) as f:
        data = json.load(f)
    points = np.asarray(data['points'], float)
    painted = np.asarray(data['weights'], float)
    columns = [BONES.index(name) for name in data['bones']]
    weights = np.zeros((len(verts), len(BONES)))
    for v, point in enumerate(verts):
        gaps = np.linalg.norm(points - point, axis=1)
        k = int(np.argmin(gaps))
        if gaps[k] > 1e-4:
            raise SystemExit(f'{path}: no painted vertex at the source vertex {v} '
                             f'(nearest {gaps[k]:.6f} u).')
        weights[v, columns] = painted[k]
    return weights


#: The number of deform segments of each upper arm and each forearm with `armSegments` of the
#: config (`ARM_SEGMENTS` of `src/models/studio-rig.ts`).
ARM_SEGMENTS = 4


def segment_bones():
    """Gives the names of the arm segments and of the elbow and wrist helpers, the left side first
    (`ARM_SEGMENT_BONES` of `src/models/studio-format.ts`). Each segment of a part is a deform bone
    along the part, and each helper starts at its joint."""
    out = []
    for side in 'LR':
        out += [f'upper_arm_seg{k}_{side}' for k in range(ARM_SEGMENTS)]
        out += [f'forearm_seg{k}_{side}' for k in range(ARM_SEGMENTS)]
        out += [f'elbow_{side}', f'wrist_{side}']
    return tuple(out)


def segment_parents():
    """Gives the parent of each arm segment and helper: the upper arm, the forearm, or, for the
    wrist helper, the forearm twist bone (`STUDIO_PARENTS` of `src/models/studio-format.ts`)."""
    out = {}
    for side in 'LR':
        for k in range(ARM_SEGMENTS):
            out[f'upper_arm_seg{k}_{side}'] = f'upper_arm_{side}'
            out[f'forearm_seg{k}_{side}'] = f'forearm_{side}'
        out[f'elbow_{side}'] = f'upper_arm_{side}'
        out[f'wrist_{side}'] = f'forearm_twist_{side}'
    return out


def segment_share(k):
    """Gives the share of the twist that the segment k of an arm part takes: the middle of the
    segment, from 0 at the start of the part to 1 at its end."""
    return (k + 0.5) / ARM_SEGMENTS


def segment_joints(heads, ends, rolls, children, rule):
    """Adds the heads, the tails, the roll hints, and the children of the arm segments and of the
    helpers (`armSegments` of the config). The segments split the upper arm and the forearm into
    equal parts. Each helper starts at its joint and points along the bone after the joint, with
    the length `rule['helper']` in units."""
    for side in 'LR':
        s, e, w = (heads[f'{b}_{side}'] for b in ('upper_arm', 'forearm', 'hand'))
        for part, a, b in (('upper_arm', s, e), ('forearm', e, w)):
            for k in range(ARM_SEGMENTS):
                name = f'{part}_seg{k}_{side}'
                heads[name] = a + (b - a) * k / ARM_SEGMENTS
                ends[name] = a + (b - a) * (k + 1) / ARM_SEGMENTS
                rolls[name] = rolls[f'{part}_{side}']
                children[name] = None
        for name, joint, toward, roll in ((f'elbow_{side}', e, w, f'forearm_{side}'),
                                          (f'wrist_{side}', w, ends[f'hand_{side}'],
                                           f'hand_{side}')):
            heads[name] = joint.copy()
            ends[name] = joint + unit(toward - joint) * rule['helper']
            rolls[name] = rolls[roll]
            children[name] = None


def twist_of(m, axis):
    """Gives the angle of the twist of a rotation matrix around a unit axis (the swing and twist
    split), from -pi to pi, as `twistAngle()` of `src/models/studio-rig.ts`."""
    x, y, z, w = matrix_quat(m)
    angle = 2 * np.arctan2(np.array([x, y, z]) @ axis, w)
    return float((angle + np.pi) % (2 * np.pi) - np.pi)


def axis_turn(axis, angle):
    """Gives the rotation matrix of a turn by `angle` radians around a unit axis."""
    half = angle / 2
    return quat_matrix([*(np.sin(half) * np.asarray(axis)), np.cos(half)])


def half_turn(a, b):
    """Gives the rotation halfway from the rotation matrix `a` to `b` (a slerp at 0.5)."""
    qa, qb = np.asarray(matrix_quat(a)), np.asarray(matrix_quat(b))
    if qa @ qb < 0:
        qb = -qb
    return quat_matrix(qa + qb)


def driven_turns(turns, heads):
    """Gives the world turns of the arm segments and of the helpers from the world turns of the
    body bones, as `poseArm()` of `src/models/studio-rig.ts` drives them. `heads` holds the joints
    of the pose from which the turns start. Each upper arm segment takes its share of the roll of
    the upper arm from the chest, and each forearm segment its share of the twist from the forearm
    to the paw (`segment_share()`). The elbow helper turns halfway from the upper arm to the
    forearm, and the wrist helper halfway from the forearm with all of the twist to the paw."""
    out = {}
    chest = turns['chest']
    for side in 'LR':
        upper, fore, hand = (turns[f'{b}_{side}'] for b in ('upper_arm', 'forearm', 'hand'))
        rest = unit(heads[f'forearm_{side}'] - heads[f'upper_arm_{side}'])
        roll = twist_of((swing(chest @ rest, upper @ rest) @ chest).T @ upper, rest)
        along = unit(heads[f'hand_{side}'] - heads[f'forearm_{side}'])
        twist = twist_of(fore.T @ hand, along)
        for k in range(ARM_SEGMENTS):
            share = segment_share(k)
            out[f'upper_arm_seg{k}_{side}'] = upper @ axis_turn(rest, (share - 1) * roll)
            out[f'forearm_seg{k}_{side}'] = fore @ axis_turn(along, share * twist)
        out[f'elbow_{side}'] = half_turn(upper, fore)
        out[f'wrist_{side}'] = half_turn(fore @ axis_turn(along, twist), hand)
    return out


def arm_bones(side):
    """Gives the arm bones of one side that move the arm vertices: the bones of `ARM`, and the arm
    segments and helpers of a rig with `armSegments`."""
    return [f'{b}_{side}' for b in ARM] + [b for b in BONES
                                           if b.endswith('_' + side) and b in SEGMENT_PARENTS]


#: The parent of each arm segment and helper.
SEGMENT_PARENTS = segment_parents()
PARENTS.update(SEGMENT_PARENTS)

#: The arm segments and the helpers that hold the skin of each arm bone that the shape of a rule of
#: `raise` relaxes (`raise_shape()`), with no side: the upper arm segments, the forearm segments
#: and the elbow helper, and the wrist helper with the forearm twist bone and the paw.
SEGMENTS_OF = {
    'clavicle': (),
    'upper_arm': tuple(f'upper_arm_seg{k}' for k in range(ARM_SEGMENTS)),
    'forearm': tuple(f'forearm_seg{k}' for k in range(ARM_SEGMENTS)) + ('elbow',),
    'forearm_twist': ('wrist',),
    'hand': ('wrist',),
    'fingers': (),
}


def bone_heat(verts, tris, heads, ends, rolls):
    """Gives the weights of each vertex on the body bones with the bone heat of Blender. The root
    does not deform. A vertex that bone heat leaves with no weight takes the nearest bone."""
    mesh = bpy.data.meshes.new('heat')
    mesh.from_pydata(to_blender(verts).tolist(), [], tris.tolist())
    mesh.update()
    ob = bpy.data.objects.new('heat', mesh)
    bpy.context.scene.collection.objects.link(ob)
    arm_data = bpy.data.armatures.new('heat_rig')
    rig = bpy.data.objects.new('heat_rig', arm_data)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for name in BONES:
        bone = arm_data.edit_bones.new(name)
        bone.head = to_blender(heads[name]).tolist()
        bone.tail = to_blender(ends[name]).tolist()
        bone.align_roll(to_blender(rolls[name]).tolist())
        bone.use_deform = name != 'root'
    for name in BONES:
        if PARENTS[name]:
            arm_data.edit_bones[name].parent = arm_data.edit_bones[PARENTS[name]]
    bpy.ops.object.mode_set(mode='OBJECT')
    for o in bpy.context.scene.objects:
        o.select_set(o in (ob, rig))
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')

    weights = np.zeros((len(verts), len(BONES)))
    index = {g.index: BONES.index(g.name) for g in ob.vertex_groups}
    for v in ob.data.vertices:
        for g in v.groups:
            weights[v.index, index[g.group]] += g.weight
    empty = weights.sum(axis=1) <= 1e-6
    if empty.any():
        for v in np.nonzero(empty)[0]:
            weights[v, nearest_bone(verts[v], heads, ends)] = 1.0
    log(f'bone heat: {int(empty.sum())} vertices with no weight took the nearest bone')
    bpy.data.objects.remove(ob)
    bpy.data.objects.remove(rig)
    return weights


def kept_heat(verts, tris, heads, ends, rolls, config):
    """Gives the bone heat of the body bones for each vertex (`bone_heat()`). With `heatSource` of
    the config, a mesh before a rebuild of some faces, each vertex at a place of that mesh takes
    the bone heat of that mesh, and only the new vertices take the bone heat of the source. Bone
    heat spreads over the whole mesh, so the new leg faces of the polar bear move the weights of
    its crotch by up to 0.23 and its seat top 7 mm down. With the heat of the mesh before the
    rebuild, the trunk, the haunch, and the seat keep their weights.
    """
    heat = bone_heat(verts, tris, heads, ends, rolls)
    if 'heatSource' not in config:
        return heat
    old_verts, old_tris, _, _ = load_mesh({**config, 'source': config['heatSource']})
    old = bone_heat(old_verts, old_tris, heads, ends, rolls)
    kept = 0
    for v, point in enumerate(verts):
        gaps = np.linalg.norm(old_verts - point, axis=1)
        k = int(np.argmin(gaps))
        if gaps[k] < 1e-6:
            heat[v] = old[k]
            kept += 1
    log(f'bone heat: {kept} of {len(verts)} vertices take the heat of {config["heatSource"]}')
    return heat


def nearest_bone(p, heads, ends):
    """Gives the index of the deforming bone whose segment is nearest to a point."""
    best, found = math.inf, 1
    for k, name in enumerate(BONES[1:], 1):
        a, b = heads[name], ends[name]
        t = np.clip(np.dot(p - a, b - a) / max(np.dot(b - a, b - a), 1e-12), 0, 1)
        d = np.linalg.norm(p - (a + t * (b - a)))
        if d < best:
            best, found = d, k
    return found


def smallest_angle(points):
    """Gives the smallest corner angle of one triangle of three points, in degrees."""
    return min(corner_angle(points[k], points[(k + 1) % 3], points[(k + 2) % 3]) for k in range(3))


def clip_polygon(verts, poly):
    """Triangulates a polygon of vertex indices, in order, by clipping at each step the ear with
    the largest smallest angle. The tests of an ear (convex, and no other corner inside) use the
    plane of the best fit of the corners. Gives triangles in the winding of the polygon."""
    points = verts[poly]
    center = points.mean(axis=0)
    _, _, axes = np.linalg.svd(points - center)
    flat = {i: np.array([(verts[i] - center) @ axes[0], (verts[i] - center) @ axes[1]])
            for i in poly}

    def cross(a, b, c):
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

    turn = 1.0 if sum(flat[poly[k]][0] * flat[poly[(k + 1) % len(poly)]][1]
                      - flat[poly[(k + 1) % len(poly)]][0] * flat[poly[k]][1]
                      for k in range(len(poly))) > 0 else -1.0
    rest = list(poly)
    out = []
    while len(rest) > 3:
        best = None
        for k in range(len(rest)):
            i, j, m = rest[k - 1], rest[k], rest[(k + 1) % len(rest)]
            a, b, c = flat[i], flat[j], flat[m]
            if cross(a, b, c) * turn <= 0:
                continue
            if any(cross(a, b, flat[q]) * turn > 0 and cross(b, c, flat[q]) * turn > 0
                   and cross(c, a, flat[q]) * turn > 0 for q in rest if q not in (i, j, m)):
                continue
            score = smallest_angle(verts[[i, j, m]])
            if best is None or score > best[0]:
                best = (score, k)
        if best is None:
            best = max((smallest_angle(verts[[rest[k - 1], rest[k], rest[(k + 1) % len(rest)]]]),
                        k) for k in range(len(rest)))
        k = best[1]
        out.append([rest[k - 1], rest[k], rest[(k + 1) % len(rest)]])
        del rest[k]
    return out + [rest]


def flip_caps(verts, faces):
    """Flips each edge between two faces of a cap when the flip makes the smaller of their
    smallest angles larger and turns neither face over, until no flip helps."""
    faces = [list(f) for f in faces]
    changed = True
    while changed:
        changed = False
        edges = {}
        for k, f in enumerate(faces):
            for i in range(3):
                edges[(f[i], f[(i + 1) % 3])] = (k, i)
        for (a, b), (k, i) in edges.items():
            if (b, a) not in edges or a > b:
                continue
            m, j = edges[(b, a)]
            c, d = faces[k][(i + 2) % 3], faces[m][(j + 2) % 3]
            old = min(smallest_angle(verts[faces[k]]), smallest_angle(verts[faces[m]]))
            new = [[c, d, b], [d, c, a]]
            normal = (np.cross(verts[b] - verts[a], verts[c] - verts[a])
                      + np.cross(verts[a] - verts[b], verts[d] - verts[b]))
            if (c != d and min(smallest_angle(verts[f]) for f in new) > old + 1e-6
                    and all(np.cross(verts[f[1]] - verts[f[0]], verts[f[2]] - verts[f[0]]) @ normal
                            > 0 for f in new)):
                faces[k], faces[m] = new
                changed = True
                break
    return faces


def cut_loop(tris, removed):
    """Gives the loop of the edges between removed faces and kept faces, in the order in which
    each loop edge runs against its kept face, so that a polygon of the loop in this order has the
    winding of the surface."""
    removed = set(int(k) for k in removed)
    directed = set()
    for k, t in enumerate(tris):
        if k not in removed:
            for i in range(3):
                directed.add((int(t[i]), int(t[(i + 1) % 3])))
    after = {}
    for k in removed:
        t = tris[k]
        for i in range(3):
            a, b = int(t[i]), int(t[(i + 1) % 3])
            if (b, a) in directed:
                if a in after:
                    raise SystemExit('The cut of the seam leaves a vertex with two loop edges.')
                after[a] = b
    loop = [next(iter(after))]
    while after[loop[-1]] != loop[0]:
        loop.append(after[loop[-1]])
    if len(loop) != len(after):
        raise SystemExit('The cut of the seam leaves more than one loop.')
    return loop


def open_loop(verts, tris, sign, top, low=-math.inf):
    """Gives the loop of the open edges of one side between the heights `low` and `top`, in the
    order of `cut_loop()`: each loop edge runs against its face. An open edge has one face. A flap
    face with an edge of three faces, as face 612 of the rabbit source beside the hole, has two
    open edges of its own, and these are no part of the loop. The height `low` keeps the open
    edges of other parts out of the loop, such as the open edges of the rhino tail."""
    faces = {}
    for k, t in enumerate(tris):
        for i in range(3):
            a, b = int(t[i]), int(t[(i + 1) % 3])
            faces.setdefault((min(a, b), max(a, b)), []).append((a, b, k))
    shared = {k for edge in faces.values() if len(edge) > 2 for _, _, k in edge}
    single = {}
    for edge in faces.values():
        if len(edge) == 1:
            single[edge[0][2]] = single.get(edge[0][2], 0) + 1
    flaps = {k for k in shared if single.get(k, 0) >= 2}
    after = {}
    for edge in faces.values():
        if len(edge) != 1 or edge[0][2] in flaps:
            continue
        a, b, _ = edge[0]
        if (verts[a, 0] * sign > 0 and verts[b, 0] * sign > 0
                and max(verts[a, 1], verts[b, 1]) < top
                and min(verts[a, 1], verts[b, 1]) > low):
            if b in after:
                raise SystemExit('The open loop of the cut has a vertex with two loop edges.')
            after[b] = a
    if not after:
        raise SystemExit('The cut finds no faces to remove and no open loop.')
    loop = [next(iter(after))]
    while after[loop[-1]] != loop[0]:
        loop.append(after[loop[-1]])
    if len(loop) != len(after):
        raise SystemExit('The open edges of the cut form more than one loop.')
    return loop


def cut_fins(verts, tris, removed, sign, top):
    """Finds the fins of a cut (`fins` of the cut): each kept face of one side below the height
    `top` with two edges against removed faces, whose corner between these edges has no other
    kept face. Such a face sticks into the hole, and the cap of the hole repeats it with the
    opposite winding. Each fin goes, and the next face can then be a fin, until none is left.
    Gives the indices of the fin faces."""
    gone = set(int(k) for k in removed)
    fins = []
    faces_of = {}
    for k, t in enumerate(tris):
        for v in t:
            faces_of.setdefault(int(v), []).append(k)
    edge_faces = {}
    for k, t in enumerate(tris):
        for i in range(3):
            a, b = int(t[i]), int(t[(i + 1) % 3])
            edge_faces.setdefault((min(a, b), max(a, b)), []).append(k)
    changed = True
    while changed:
        changed = False
        for k, t in enumerate(tris):
            if (k in gone or not (verts[t, 0] * sign > 0).all()
                    or verts[t, 1].max() >= top):
                continue
            open_edges = []
            for i in range(3):
                a, b = int(t[i]), int(t[(i + 1) % 3])
                if any(m in gone for m in edge_faces[(min(a, b), max(a, b))] if m != k):
                    open_edges.append({a, b})
            if len(open_edges) != 2:
                continue
            middle = (open_edges[0] & open_edges[1]).pop()
            if all(m in gone for m in faces_of[middle] if m != k):
                gone.add(k)
                fins.append(k)
                changed = True
    return fins


def cut_seam(verts, tris, uvs, rules, heads, ends, rule):
    """Cuts the mesh where each hanging forearm touches the belly (`cut` of the config). Each face
    below the height `top` with a corner in the free arm (`free_arm()`) and a corner outside it
    goes. The loop of the hole has a run of the arm and a run of the body. A cap closes each run
    (`clip_polygon()`, `flip_caps()`), and a quad joins the ends of the two runs at the top, where
    the arm and the body stay joined. Thus the forearm and the belly share no vertex below the
    top, and no vertex moves. Each new face takes the UVs of the nearest kept face of its own part.
    Gives the triangles, the UVs, and for each side the removed faces, the new faces, the run of
    the arm, and the run of the body."""
    keep = np.ones(len(tris), bool)
    added, added_uvs, report = [], [], []
    for side, sign in (('L', 1.0), ('R', -1.0)):
        arm = free_arm(verts, tris, rules, heads, ends, sign)
        mixed = [k for k, t in enumerate(tris)
                 if arm[t].any() and (~arm[t]).any() and (verts[t, 0] * sign > 0).all()
                 and verts[t, 1].max() < rule['top']]
        if rule.get('fins') and mixed:
            fins = cut_fins(verts, tris, mixed, sign, rule['top'])
            mixed += fins
            log(f'cut {side}: {len(fins)} fins go {fins}')
        # A copy of the mesh that removed these faces itself and closed the arm, as the remodel
        # of the rabbit elbows, leaves only the hole of the trunk open (`open_loop()`).
        # The height `low` of the cut keeps the open edges of other parts below the hole out of
        # the loop.
        loop = (cut_loop(tris, mixed) if mixed
                else open_loop(verts, tris, sign, rule['top'], rule.get('low', -math.inf)))
        start = next(k for k in range(len(loop)) if arm[loop[k]] and not arm[loop[k - 1]])
        loop = loop[start:] + loop[:start]
        count = int(arm[loop].sum())
        if not arm[loop[:count]].all():
            raise SystemExit(f'The loop of the cut of the side {side} has more than two runs.')
        arm_run, body_run = loop[:count], loop[count:]
        a1, ak, b1, bm = arm_run[0], arm_run[-1], body_run[0], body_run[-1]
        if np.linalg.norm(verts[ak] - verts[bm]) <= np.linalg.norm(verts[b1] - verts[a1]):
            bridge = [[ak, b1, bm], [ak, bm, a1]]
        else:
            bridge = [[ak, b1, a1], [b1, bm, a1]]
        # An arm run of two vertices is the edge of an arm that the copy of the mesh closed, and
        # needs no cap.
        arm_cap = flip_caps(verts, clip_polygon(verts, arm_run)) if len(arm_run) > 2 else []
        faces = arm_cap + flip_caps(verts, clip_polygon(verts, body_run)) + bridge
        keep[mixed] = False
        # Each new face takes the UVs of the kept face across its loop edge, so that the cap
        # continues the fur at its edge. A new face with no loop edge takes the UVs of the nearest
        # new face of its part that has one.
        across = {}
        for k in np.nonzero(keep)[0]:
            t = tris[k]
            for i in range(3):
                across[(int(t[(i + 1) % 3]), int(t[i]))] = k
        source = [next((across[(f[i], f[(i + 1) % 3])] for i in range(3)
                        if (f[i], f[(i + 1) % 3]) in across), None) for f in faces]
        mids = np.array([verts[f].mean(axis=0) for f in faces])
        for j, f in enumerate(faces):
            if source[j] is None:
                same = [m for m in range(len(faces)) if source[m] is not None
                        and arm[faces[m]].all() == arm[f].all()]
                source[j] = source[min(same, key=lambda m: np.linalg.norm(mids[m] - mids[j]))]
            added_uvs.append(uvs[source[j]])
        added += faces
        report.append((side, mixed, faces, arm_run, body_run))
    return (np.concatenate([tris[keep], np.array(added, tris.dtype)]),
            np.concatenate([uvs[keep], np.array(added_uvs)]), report)


def cut_rim(tris, body_caps, arm_caps):
    """Finds the rim of the caps of the body of a cut (`bodyNormals` of the cut): each skin face
    with a corner on a cap of the body and no corner on a cap of the arm. The side of the trunk of
    the source curls in where it joins the hanging arm, so these faces turn far from the skin
    around them, and a raised arm shows them as a dark crack. Gives a mask of the faces."""
    on_body = np.zeros(int(tris.max()) + 1, bool)
    on_body[tris[body_caps].ravel()] = True
    on_arm = np.zeros(len(on_body), bool)
    on_arm[tris[arm_caps].ravel()] = True
    new = body_caps | arm_caps
    return ~new & on_body[tris].any(axis=1) & ~on_arm[tris].any(axis=1)


def root_rim(verts, tris, heads, rule, weights):
    """Finds the skin faces around the shoulder joints (`rootNormals` of the config): each face
    whose middle lies within `radius` of the head of an upper arm. The seated bind turns a hanging
    arm up, so the faces of its root meet at sharp angles, and the crease angle of the app splits
    their normals into a dark wedge under the raised arm. The app gives these faces the normals
    of the skin with no crease angle, as the rim of a cut. With `elbow`, each face whose middle
    lies within that radius of the head of a forearm is in the rim too: an elbow that the bind
    bends gives the same split at the inner elbow.

    With `armShare`, a face stays in the rim only when the mean weight of its corners on the
    clavicle and the arm bones of its side is at least that share. A trunk face whose corner
    joins the arm root takes the mean normal of the arm root faces at that corner, which point
    down and back in the bind, so a trunk face that the arm does not move shades as a dark patch
    under the raised arm.

    With `knee`, each face whose middle lies within that radius of a knee joint, behind it in the
    source (-z), and on the leg bones of its side for at least half of its weight is in the rim
    too: the bent knee folds the back of the leg into a crease whose faces turn more than the
    crease angle from each other. With `kneeFront`, each face whose middle lies within that
    radius of a knee joint, in front of it in the source (+z), and on the leg bones of its side
    for at least half of its weight is in the rim too: short edges of the round front of the bent
    knee can turn more than the crease angle.

    With `wrist` (two lengths in units: back and ahead), each face whose middle lies from `back`
    units before a wrist joint along the forearm to `ahead` units past it along the paw, within
    `wristReach` units of the joint, and on the arm bones of its side for at least half of its
    weight is in the rim too: the bridge from the last ring of a rebuilt arm tube to the paw is a
    band of thin faces, and the seated bind turns the paw, so the edges of the band can turn more
    than the crease angle. The claws start past the band and keep their facets. Gives a mask of
    the faces."""
    mids = verts[tris].mean(axis=1)
    out = np.zeros(len(tris), bool)
    for side in 'LR':
        if 'wrist' in rule:
            back, ahead = rule['wrist']
            elbow, wrist, tip = (np.asarray(heads[f'{b}_{side}'], float)
                                 for b in ('forearm', 'hand', 'fingers'))
            gap = mids - wrist
            along = np.where(gap @ unit(wrist - elbow) < 0, gap @ unit(wrist - elbow),
                             gap @ unit(tip - wrist))
            bones = [BONES.index(b) for b in arm_bones(side)]
            share = weights[:, bones].sum(axis=1)[tris].mean(axis=1)
            out |= ((along > -back) & (along < ahead) & (share >= 0.5)
                    & (np.linalg.norm(gap, axis=1) < rule.get('wristReach', 0.1)))
        joint = np.asarray(heads[f'shin_{side}'], float)
        legs = [BONES.index(f'{b}_{side}') for b in LEG]
        share = weights[:, legs].sum(axis=1)[tris].mean(axis=1)
        near = np.linalg.norm(mids - joint, axis=1)
        if 'knee' in rule:
            out |= (near < rule['knee']) & (mids[:, 2] < joint[2]) & (share >= 0.5)
        if 'kneeFront' in rule:
            out |= (near < rule['kneeFront']) & (mids[:, 2] >= joint[2]) & (share >= 0.5)
        near = np.zeros(len(tris), bool)
        for bone, key in (('upper_arm', 'radius'), ('forearm', 'elbow')):
            joint = np.asarray(heads[f'{bone}_{side}'], float)
            near |= np.linalg.norm(mids - joint, axis=1) < rule.get(key, 0.0)
        if 'armShare' in rule:
            bones = [BONES.index(f'clavicle_{side}')] + [BONES.index(b) for b in arm_bones(side)]
            share = weights[:, bones].sum(axis=1)[tris].mean(axis=1)
            near &= share >= rule['armShare']
        out |= near
    return out


def rim_turns(bind, tris, caps, rim):
    """Gives the largest turn in degrees between the normal of each face of `rim` and the normal
    that the app gives its corners: the mean of the normals of the skin faces at the vertex, each
    with the angle of its corner, with no cap (`studioNormals()`). A vertex in a deep notch of the
    seated bind, where the inner side of the arm meets the trunk, has skin faces that point in
    opposite directions, so their mean can point far from each of them. Gives 0 for a face out of
    the rim."""
    a, b, c = (bind[tris[:, k]] for k in range(3))
    normals = np.cross(b - a, c - a)
    normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-12)
    sums = np.zeros_like(bind)
    for k in range(3):
        p, q, r = (bind[tris[:, (k + j) % 3]] for j in range(3))
        u, v = q - p, r - p
        cos = np.einsum('ij,ij->i', u, v) / np.maximum(
            np.linalg.norm(u, axis=1) * np.linalg.norm(v, axis=1), 1e-12)
        angle = np.arccos(np.clip(cos, -1.0, 1.0))
        np.add.at(sums, tris[~caps, k], (normals * angle[:, None])[~caps])
    means = sums / np.maximum(np.linalg.norm(sums, axis=1, keepdims=True), 1e-12)
    dots = np.einsum('ijk,ik->ij', means[tris], normals)
    turns = np.degrees(np.arccos(np.clip(dots.min(axis=1), -1.0, 1.0)))
    return np.where(rim, turns, 0.0)


def arm_side(verts, rules, heads, ends, sign):
    """Finds the vertices beyond the plane of the arm split of one side (`armSplit`). With
    `armFree` of the rules, the plane turns by `turn` degrees around the vertical, so that its
    front edge lies nearer to the middle plane than its back edge, as the notches where a thick
    arm joins the side of the trunk. A vertex then also lies within `radius` of the chain of the
    arm joints, from the shoulder to the finger tip, and above the height `floor`, so that the
    side of the trunk and the thigh beside the arm are not a part of it. With `shift`, the chain
    moves by that vector of the left side before the distance, for an arm whose section is not
    round around its joints, such as the bear arm, whose root reaches farther back than forward.
    With `root`, a vertex between the plane of `armSplit` and the plane `root.split` lies in the
    free arm only between the heights `root.heights`: the lips of the notches where the arm root
    joins the trunk, and not the side of the trunk beside the forearm or the top of the shoulder,
    as on the panda."""
    left = verts * [sign, 1.0, 1.0]
    rule = rules.get('armFree')
    if rule is None:
        return left[:, 0] > rules['armSplit']
    turn = math.radians(rule['turn'])
    across = left[:, 0] * math.cos(turn) + left[:, 2] * math.sin(turn)
    chain = [heads[f'{bone}_L'] for bone in ARM if bone != 'forearm_twist'] + [ends['fingers_L']]
    chain = np.asarray(chain, float) + np.asarray(rule.get('shift', [0.0, 0.0, 0.0]), float)
    gap = np.full(len(verts), np.inf)
    for a, b in zip(chain[:-1], chain[1:]):
        ab = b - a
        share = np.clip(((left - a) @ ab) / (ab @ ab), 0.0, 1.0)
        gap = np.minimum(gap, np.linalg.norm(left - (a + share[:, None] * ab), axis=1))
    side = (across > rules['armSplit']) & (gap < rule['radius']) & (left[:, 1] > rule['floor'])
    root = rule.get('root')
    if root is not None:
        low, high = root['heights']
        back, front = root.get('depths', [-math.inf, math.inf])
        band = ((left[:, 1] > low) & (left[:, 1] < high) & (left[:, 2] > back)
                & (left[:, 2] < front))
        side &= (across > root['split']) | band
    return side


#: The plane of the crease of each side (`crease_side()`), by the sign of the side.
CREASE_PLANES = {}


def crease_side(verts, tris, rule, heads, ends, sign):
    """Finds the vertices of one side beyond the crease where a joined upper arm meets the trunk
    (`armCrease` of the rules). In a mesh whose hanging arm is one solid with the trunk, the
    surface turns in at a concave crease along the front and the back of the upper arm. The plane
    of `armSplit` lies out of these creases, so without the rule the free arm is only the outer
    shell of the arm, and the cut closes it with a flat face: a thin plate in each raised pose,
    with no armpit. The
    rule finds each concave edge sharper than `angle` degrees between the heights `heights`,
    farther than `inner` from the middle plane and within `radius` of the arm chain, and fits a
    plane x = a + b y + c z through their middles, with no edge farther than `fit` from it. A
    vertex below the height `below` and farther than `margin` out of that plane lies on the side
    of the arm. Gives a mask of the vertices."""
    left = verts * [sign, 1.0, 1.0]
    low, high = rule['heights']
    chain = np.asarray([heads[f'{bone}_L'] for bone in ARM if bone != 'forearm_twist']
                       + [ends['fingers_L']], float)
    gap = np.full(len(verts), np.inf)
    for a, b in zip(chain[:-1], chain[1:]):
        ab = b - a
        share = np.clip(((left - a) @ ab) / (ab @ ab), 0.0, 1.0)
        gap = np.minimum(gap, np.linalg.norm(left - (a + share[:, None] * ab), axis=1))
    near = ((left[:, 0] > rule['inner']) & (left[:, 1] > low) & (left[:, 1] < high)
            & (gap < rule['radius']))
    faces = {}
    for k, t in enumerate(tris):
        for i in range(3):
            a, b = int(t[i]), int(t[(i + 1) % 3])
            faces.setdefault((min(a, b), max(a, b)), []).append(k)
    normals = np.cross(verts[tris[:, 1]] - verts[tris[:, 0]], verts[tris[:, 2]] - verts[tris[:, 0]])
    normals /= np.linalg.norm(normals, axis=1)[:, None]
    middles = []
    for (a, b), pair in faces.items():
        if len(pair) != 2 or not (near[a] and near[b]):
            continue
        far = next(int(v) for v in tris[pair[1]] if v not in (a, b))
        middle = (verts[a] + verts[b]) / 2
        bend = math.degrees(math.acos(np.clip(normals[pair[0]] @ normals[pair[1]], -1.0, 1.0)))
        if (verts[far] - middle) @ normals[pair[0]] > 0 and bend > rule['angle']:
            middles.append(middle * [sign, 1.0, 1.0])
    plane = CREASE_PLANES.get(sign)
    if plane is None:
        # The first call sees the source. The cut removes the faces of the crease, so each later
        # call takes the plane of the first call.
        if len(middles) < 3:
            raise SystemExit(f'armCrease finds {len(middles)} crease edges on the side '
                             f'{sign:+.0f}.')
        middles = np.array(middles)
        rows = np.c_[np.ones(len(middles)), middles[:, 1], middles[:, 2]]
        keep = np.ones(len(middles), bool)
        # A crease of the trunk near the arm lies far from the plane of the arm crease. Each
        # round drops the edge farthest from the plane while it is farther than `fit`.
        while True:
            plane, *_ = np.linalg.lstsq(rows[keep], middles[keep, 0], rcond=None)
            far = np.where(keep, np.abs(rows @ plane - middles[:, 0]), -1.0)
            if far.max() <= rule['fit'] or keep.sum() <= 3:
                break
            keep[int(np.argmax(far))] = False
        CREASE_PLANES[sign] = plane
        log(f'arm crease {sign:+.0f}: {int(keep.sum())} of {len(middles)} edges, x = '
            f'{plane[0]:.4f} + {plane[1]:.4f} y + {plane[2]:.4f} z, largest distance '
            f'{far.max():.4f} u')
    out = left[:, 0] > plane[0] + plane[1] * left[:, 1] + plane[2] * left[:, 2] + rule['margin']
    return out & (left[:, 1] < rule['below'])


def free_arm(verts, tris, rules, heads, ends, sign):
    """Finds the vertices of the free arm of one side: the part of the mesh beyond the plane of the
    arm split (`arm_side()`) that holds the vertex nearest to the finger tip. The haunch beside the
    body is beyond that plane too, and it is not a part of the arm. With `armIslands` of the
    rules, the free arm also holds each island of vertices on its side that only vertices of the
    free arm surround (`arm_islands()`), such as the new inner side of a remodeled arm that lies
    inside the plane."""
    tip = np.asarray(ends['fingers_L'], float) * [sign, 1.0, 1.0]
    side = arm_side(verts, rules, heads, ends, sign)
    if rules.get('armCrease'):
        side |= crease_side(verts, tris, rules['armCrease'], heads, ends, sign)
    free = connected_part(verts, tris, side, tip)
    if rules.get('armIslands'):
        free |= arm_islands(verts, tris, free, sign)
    return free


def arm_islands(verts, tris, free, sign):
    """Finds the islands of a free arm: each part of the vertices outside the free arm, joined by
    edges with both corners outside it, that has all its vertices on the side of the sign, touches
    the free arm, and is not the largest part (the trunk). Gives a mask of the vertices."""
    outside = ~free
    neighbors = [[] for _ in range(len(verts))]
    touches = np.zeros(len(verts), bool)
    for t in tris:
        for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
            if outside[a] and outside[b]:
                neighbors[a].append(b)
                neighbors[b].append(a)
            elif outside[a] != outside[b]:
                touches[a if outside[a] else b] = True
    seen = np.zeros(len(verts), bool)
    parts = []
    for start in np.nonzero(outside)[0]:
        if seen[start]:
            continue
        part, stack = [], [int(start)]
        seen[start] = True
        while stack:
            v = stack.pop()
            part.append(v)
            for n in neighbors[v]:
                if not seen[n]:
                    seen[n] = True
                    stack.append(n)
        parts.append(part)
    largest = max(parts, key=len)
    out = np.zeros(len(verts), bool)
    for part in parts:
        if (part is not largest and touches[part].any()
                and (verts[part, 0] * sign > 0).all()):
            out[part] = True
    return out


def hanging_ear(verts, tris, rule, sign):
    """Finds the vertices of the flap of a hanging ear of one side (`earFlap`): the part of the
    mesh below the height `cut` and farther than `apart` from the middle plane that holds the
    vertex nearest to `tip` (the left ear, mirrored for the right ear). Below the cut, the flap
    hangs apart from the side of the head."""
    inside = (verts[:, 1] < rule['cut']) & (verts[:, 0] * sign > rule['apart'])
    tip = np.asarray(rule['tip'], float) * [sign, 1.0, 1.0]
    return connected_part(verts, tris, inside, tip)


def connected_part(verts, tris, inside, tip):
    """Finds the part of the mesh inside a set of vertices that holds the vertex nearest to a
    point: the vertices that edges with both corners inside join to that vertex."""
    neighbors = [[] for _ in range(len(verts))]
    for t in tris:
        for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
            if inside[a] and inside[b]:
                neighbors[a].append(b)
                neighbors[b].append(a)
    start = int(np.argmin(np.linalg.norm(verts - tip, axis=1)))
    seen = {start}
    stack = [start]
    while stack:
        for n in neighbors[stack.pop()]:
            if n not in seen:
                seen.add(n)
                stack.append(n)
    out = np.zeros(len(verts), bool)
    out[sorted(seen)] = True
    return out


def polyline_place(points, line):
    """Gives for each point its place along a line of segments, as the length from the start of
    the line to the nearest point of the line, and its distance from that point."""
    best = np.full(len(points), np.inf)
    place = np.zeros(len(points))
    start = 0.0
    for a, b in zip(line, line[1:]):
        d = b - a
        length = float(np.linalg.norm(d))
        t = np.clip((points - a) @ d / (length * length), 0.0, 1.0)
        gap = np.linalg.norm(points - (a + t[:, None] * d), axis=1)
        near = gap < best
        best[near] = gap[near]
        place[near] = start + t[near] * length
        start += length
    return place, best


def tail_weights(verts, tris, w, rule, heads, ends):
    """Gives a tail of two bones smooth weights along its line (design 4.4). The tail is the part
    of the mesh within `radius` of the line from the root over the bend to the tip, and behind the
    plane z = `behind`. Along the line, the share of the tail bones grows from 0 to 1 over the
    place range `root` (units from the root), and the share of the tip within the tail grows from
    0 to 1 over `bend` units on each side of the bend. Then the share of the tail bones takes the
    mean of its neighbors in `smooth` rounds, so that the root has no hard edge. No other vertex
    follows the tail bones."""
    col = {name: k for k, name in enumerate(BONES)}
    root, bend, tip = heads['tail'], heads[TAIL_TIP], ends[TAIL_TIP]
    place, gap = polyline_place(verts, [root, bend, tip])
    inside = (gap <= rule['radius']) & (verts[:, 2] <= rule['behind'])
    share = smoothstep(place, *rule['root']) * inside
    neighbors = [set() for _ in range(len(verts))]
    for a, b, c in tris:
        neighbors[a].update((b, c))
        neighbors[b].update((a, c))
        neighbors[c].update((a, b))
    neighbors = [np.array(sorted(n), dtype=int) for n in neighbors]
    # A vertex with no face, such as the corner of a fin that the cut removes (`cut_fins()`),
    # keeps its share.
    for _ in range(rule['smooth']):
        share = np.array([share[n].mean() if len(n) else share[k]
                          for k, n in enumerate(neighbors)])
    first = float(np.linalg.norm(bend - root))
    tip_share = smoothstep(place, first - rule['bend'], first + rule['bend'])
    out = w.copy()
    out[:, col['hips']] += out[:, col['tail']] + out[:, col[TAIL_TIP]]
    out[:, col['tail']] = 0.0
    out[:, col[TAIL_TIP]] = 0.0
    out *= (1.0 - share)[:, None]
    out[:, col['tail']] = share * (1.0 - tip_share)
    out[:, col[TAIL_TIP]] = share * tip_share
    log(f'tail: {int(inside.sum())} vertices in the tail, {int((share > 0).sum())} with a tail '
        f'weight after {rule["smooth"]} rounds, the bend {first:.3f} u from the root')
    return out


def curve_samples(points, steps=40):
    """Gives the samples of a Catmull-Rom curve through the points, `steps` on each span, and the
    length along the curve at each sample."""
    p = np.asarray(points, float)
    ext = np.vstack([2 * p[0] - p[1], p, 2 * p[-1] - p[-2]])
    out = []
    for i in range(len(p) - 1):
        p0, p1, p2, p3 = ext[i:i + 4]
        for t in np.linspace(0.0, 1.0, steps + 1)[:-1]:
            out.append(0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                              + (3 * p1 - p0 - 3 * p2 + p3) * t ** 3))
    out.append(p[-1])
    out = np.asarray(out)
    return out, np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(out, axis=0), axis=1))])


def moving_frames(samples, tangents, normal):
    """Gives the rotation-minimizing frame of each sample of a curve, by the double reflection of
    Wang, Jüttler, Zheng, and Liu (2008): the columns are the normal, the binormal, and the
    tangent. The first normal is `normal`, made normal to the first tangent."""
    r = normal - (normal @ tangents[0]) * tangents[0]
    r = unit(r)
    out = []
    for i in range(len(samples)):
        t = tangents[i]
        out.append(np.stack([r, np.cross(t, r), t], axis=1))
        if i + 1 == len(samples):
            break
        v1 = samples[i + 1] - samples[i]
        c1 = v1 @ v1
        if c1 < 1e-16:
            continue
        r_l = r - (2.0 / c1) * (v1 @ r) * v1
        t_l = t - (2.0 / c1) * (v1 @ t) * v1
        v2 = tangents[i + 1] - t_l
        c2 = v2 @ v2
        r = r_l if c2 < 1e-16 else r_l - (2.0 / c2) * (v2 @ r_l) * v2
    return np.asarray(out)


def curl_line(rule, root):
    """Gives the samples of the curled tail of the seated bind (`studio.tailCurl`): a Catmull-Rom
    curve from the root of the tail through `points`, the places relative to the root in the
    units of the studio. Gives the samples, their tangents, and the length at each sample."""
    samples, lengths = curve_samples(np.vstack([[0.0, 0.0, 0.0],
                                                np.asarray(rule['points'], float)]) + root)
    tangents = np.gradient(samples, axis=0)
    tangents /= np.linalg.norm(tangents, axis=1)[:, None]
    return samples, tangents, lengths


def curl_directions(rule, heads, ends):
    """Gives the bind direction of each tail bone on the curled tail (`studio.tailCurl`): the root
    bone points from the root to the place of the bend along the curve, and the tip bone from its
    head to the place of the tip along the curve."""
    root, bend, tip = heads['tail'], heads[TAIL_TIP], ends[TAIL_TIP]
    first = float(np.linalg.norm(bend - root))
    total = first + float(np.linalg.norm(tip - bend))
    samples, _, lengths = curl_line(rule, np.zeros(3))
    at = [np.array([np.interp(s, lengths, samples[:, k]) for k in range(3)])
          for s in (first, total)]
    head = first * unit(at[0])
    return {'tail': unit(at[0]), TAIL_TIP: unit(at[1] - head)}


def tail_line(src, share, bones, bins=10):
    """Gives the middle line of the tail of the source: a Catmull-Rom curve from the root of the
    tail through the middle of each of `bins` slices of the vertices only on the tail bones, cut
    along the line of the bones (from the root over the bend to the tip). The tails of the
    meshes are curved tubes. With the line of the bones, the vertices near the bend take the frame
    of one bone or the other, and the vertices outside the bend go to the point of the bend, so
    the curled tail folds and goes flat there. Gives the samples, their tangents, and the length at
    each sample."""
    pure = src[share > 0.99]
    place, _ = polyline_place(pure, bones)
    edges = np.linspace(0.0, float(place.max()), bins + 1)
    middles = [pure[(place >= a) & (place <= b)].mean(axis=0)
               for a, b in zip(edges, edges[1:]) if ((place >= a) & (place <= b)).sum() >= 3]
    samples, lengths = curve_samples(np.vstack([bones[:1], middles]))
    tangents = np.gradient(samples, axis=0)
    tangents /= np.linalg.norm(tangents, axis=1)[:, None]
    return samples, tangents, lengths


def tail_curl(src, bind, tris, weights, heads, ends, root, rule):
    """Curls the tail of the seated bind along a curve (`studio.tailCurl`), as a sitting cat
    curls its tail on the seat. Each tail vertex keeps its place along the middle line of the tail
    of the source (`tail_line()`) and its offset from the line, and moves to the same place along
    the curve, with the offset turned by the moving frames of the two lines
    (`moving_frames()`). A vertex with a part of its weight on the tail moves by that part, so
    that the root has no hard edge. With `blend` (two shares of the tail), a vertex moves by the
    smoothstep of its tail share over them, so that the root of the tail stays with the haunch. The corrective shapes give the source back, so the standing
    body keeps the tail of the source. With `thin` (a factor and two places along the line, in
    units from the root), the offset from the line shrinks to the factor by the smoothstep of the
    place over the two places, so that a thick tail of the source becomes thin on the seat. With
    `smooth`, that number of rounds of `taubin()` round the curled tube. Gives the moved bind
    mesh and the count of moved vertices."""
    share = weights[:, BONES.index('tail')] + weights[:, BONES.index(TAIL_TIP)]
    ids = np.nonzero(share > 0)[0]
    bones = np.asarray([heads['tail'], heads[TAIL_TIP], ends[TAIL_TIP]], float)
    s_points, s_dirs, s_lengths = tail_line(src, share, bones)
    c_points, c_dirs, c_lengths = curl_line(rule, root)
    # The first normal of the curve is the first normal of the line, turned the least way onto
    # the first tangent of the curve.
    first = np.array([1.0, 0.0, 0.0])
    s_frames = moving_frames(s_points, s_dirs, first)
    c_frames = moving_frames(c_points, c_dirs, swing(s_dirs[0], c_dirs[0]) @ first)
    place, _ = polyline_place(src[ids], s_points)
    s_at = np.clip(np.searchsorted(s_lengths, place, side='right') - 1, 0, len(s_lengths) - 1)
    c_at = np.clip(np.searchsorted(c_lengths, place, side='right') - 1, 0, len(c_lengths) - 1)
    near = s_points[s_at] + s_dirs[s_at] * (place - s_lengths[s_at])[:, None]
    offset = np.einsum('nji,nj->ni', s_frames[s_at], src[ids] - near)
    if 'thin' in rule:
        factor, start, end = rule['thin']
        offset *= (1.0 - (1.0 - factor) * smoothstep(place, start, end))[:, None]
    curled = (c_points[c_at] + c_dirs[c_at] * (place - c_lengths[c_at])[:, None]
              + np.einsum('nij,nj->ni', c_frames[c_at], offset))
    if 'blend' in rule:
        share = smoothstep(share, *rule['blend'])
    out = bind.copy()
    out[ids] = bind[ids] + share[ids, None] * (curled - bind[ids])
    if 'smooth' in rule:
        # The bend of the curl and the tip of the source tail make a corner and a knob on the
        # seat. Each vertex moves by its share of the curl, so that the root keeps the haunch.
        out = taubin(out, tris, ids, share[ids], rule['smooth'])
    return out, len(ids)


def taubin(points, tris, ids, share, rounds):
    """Smooths the vertices `ids` by the method of Taubin (1995): in each round, each vertex moves
    a half of the way to the middle of its neighbors, then 0.53 of the way back, so that a tube
    keeps its width. Each vertex moves by its `share`, so that the edge of the region keeps its
    neighbors. Gives the smoothed points."""
    neighbors = [set() for _ in range(len(points))]
    for a, b, c in tris:
        neighbors[a].update((b, c))
        neighbors[b].update((a, c))
        neighbors[c].update((a, b))
    rings = [np.array(sorted(neighbors[i])) for i in ids]
    out = points.copy()
    for _ in range(rounds):
        for factor in (0.5, -0.53):
            mids = np.array([out[r].mean(axis=0) for r in rings])
            out[ids] += (factor * share)[:, None] * (mids - out[ids])
    return out


def arm_smooth(verts, tris, weights, rule):
    """Smooths the arm tubes of the source (`armSmooth`): `rounds` rounds of `taubin()` on each
    vertex of the sides of `sides` with a weight on a bone of its side whose name starts with one
    of `bones` (by default an upper arm, a forearm, or an elbow bone). Each vertex moves by that
    weight, so that the paw and the trunk keep their form. The rebuilt arms put dense rings onto
    the big flat faces of the mesh, so each ring takes the sharp ridges between the faces, and the
    smooth normals of the app shade each ridge as a lump or a dent (on the hippo, the wolf, and the
    cat). Gives the smoothed vertices, the number of moved vertices, and the largest move."""
    share = np.zeros(len(verts))
    for side in rule.get('sides', 'LR'):
        cols = [k for k, name in enumerate(BONES)
                if name.endswith(f'_{side}')
                and name.startswith(tuple(rule.get('bones', ('upper_arm', 'forearm', 'elbow'))))]
        share += weights[:, cols].sum(axis=1)
    share = np.clip(share, 0.0, 1.0)
    ids = np.nonzero(share > 0)[0]
    out = taubin(verts, tris, ids, share[ids], rule['rounds'])
    return out, len(ids), float(np.linalg.norm(out - verts, axis=1).max(initial=0.0))


def apply_rules(verts, tris, weights, rules, heads, ends):
    """Applies the weight rules of the config: the arms, the haunch on the hips, the tail, the ears
    on their bones, and the head only above the head line."""
    w = weights.copy()
    col = {name: k for k, name in enumerate(BONES)}
    y = verts[:, 1]

    # The arms: bone heat gives a part of the arm weight to the side of the trunk, where the arm
    # hangs near it. Beyond the plane of the split, only the free arm follows the arm bones. Inside
    # it, the shoulder follows the upper arm and no lower bone of the arm.
    trunk = [col[name] for name in ('hips', 'spine', 'spine1', 'chest')]
    for side, sign in (('L', 1.0), ('R', -1.0)):
        arm = [col[f'{bone}_{side}'] for bone in ARM]
        lower = arm[1:]
        free = free_arm(verts, tris, rules, heads, ends, sign)
        # An island of the free arm inside the plane (`armIslands`) follows the arm as the free
        # arm beyond it does.
        beyond = arm_side(verts, rules, heads, ends, sign) | free
        for v in np.nonzero(beyond & ~free)[0]:
            target = trunk[int(np.argmax(w[v, trunk]))] if w[v, trunk].any() else col['spine1']
            w[v, target] += w[v, arm].sum()
            w[v, arm] = 0.0
        inside = (verts[:, 0] * sign > 0) & ~beyond
        w[inside, col[f'upper_arm_{side}']] += w[inside][:, lower].sum(axis=1)
        for k in lower:
            w[inside, k] = 0.0

        # The trunk under the armpit: inside the plane, the share of the arm weight that a vertex
        # keeps grows from 0 at the lower height of `armBelow` to 1 at the upper height, and the
        # trunk bone with the most weight takes the rest. Below a cut of the armpit, the trunk is
        # apart from the arm, so a lowered arm does not drag the thin faces of the trunk.
        if 'armBelow' in rules:
            keep = smoothstep(y, *rules['armBelow'])
            moved = np.nonzero(inside & (keep < 1.0) & (w[:, arm].sum(axis=1) > 0))[0]
            for v in moved:
                target = trunk[int(np.argmax(w[v, trunk]))] if w[v, trunk].any() else col['spine1']
                taken = w[v, arm] * (1.0 - keep[v])
                w[v, target] += taken.sum()
                w[v, arm] -= taken
            log(f'arm below {side}: {len(moved)} vertices of the trunk give arm weight to the trunk')

        # The inner root of the free arm (`armRoot`): bone heat gives an arm that a cut parts
        # from the trunk only arm weights, so the inner side of its root swings deep into the
        # chest with the upper arm. Near the shoulder joint, a vertex of the free arm on the side
        # toward the trunk gives the share `share` of its arm weight to the chest. The share fades
        # out along the upper arm from the place `along[0]` to `along[1]` (upper arm lengths from
        # the shoulder joint), and in from the bone axis from the direction `inner[1]` to
        # `inner[0]` (1 straight toward the middle plane, 0 forward or back).
        if 'armRoot' in rules:
            rule = rules['armRoot']
            left = verts * [sign, 1.0, 1.0]
            start = np.asarray(heads['upper_arm_L'], float)
            bone = np.asarray(heads['forearm_L'], float) - start
            length = float(np.linalg.norm(bone))
            axis = bone / length
            rel = left - start
            along = rel @ axis / length
            radial = rel - np.outer(rel @ axis, axis)
            inward = -radial[:, 0] / np.maximum(np.linalg.norm(radial, axis=1), 1e-9)
            share = (rule['share'] * (1.0 - smoothstep(along, *rule['along']))
                     * smoothstep(inward, *rule['inner']) * free)
            taken = w[:, arm] * share[:, None]
            w[:, arm] -= taken
            w[:, col['chest']] += taken.sum(axis=1)
            log(f'arm root {side}: {int((share > 0).sum())} vertices of the free arm give '
                f'arm weight to the chest, at most {share.max():.2f}')

        # A free arm that is a tube of its own (`armOwn`), with no face that joins the trunk:
        # bone heat gives the inner side of the tube and its dome inside the shoulder a part of
        # the trunk weight, which pins them to the trunk while the arm turns. Each vertex of the
        # free arm keeps only its arm weights, and the upper arm takes the weight of a vertex
        # with none.
        if rules.get('armOwn'):
            own = list(arm)
            rest = [k for k in range(w.shape[1]) if k not in own]
            share = w[free][:, rest].sum(axis=1)
            kept = w[free][:, own].sum(axis=1)
            rows = np.nonzero(free)[0]
            w[rows[:, None], rest] = 0.0
            none = rows[kept <= 0]
            w[none, col[f'upper_arm_{side}']] = 1.0
            some = rows[kept > 0]
            w[some[:, None], own] /= w[some][:, own].sum(axis=1)[:, None]
            log(f'arm own {side}: {len(rows)} vertices of the free arm give {share.sum():.1f} of '
                f'other weight to the arm, the most {share.max():.2f}')

    # The chest below the clavicles: the clavicle weight fades out downward, so that the turn of
    # a shoulder does not shear the faces of the chest.
    if 'clavicleFrom' in rules:
        keep = smoothstep(y, *rules['clavicleFrom'])
        for side in 'LR':
            taken = w[:, col[f'clavicle_{side}']] * (1.0 - keep)
            w[:, col[f'clavicle_{side}']] -= taken
            w[:, col['chest']] += taken

    # The chest between the clavicles: the clavicle weight fades out toward the middle plane, from
    # all at the larger distance of `clavicleMiddle` to none at the smaller distance, below the
    # head line. The chest takes the rest. Thus a face on the middle plane does not take the
    # weights of both clavicles, which a bow arm turns far apart.
    if 'clavicleMiddle' in rules:
        keep = smoothstep(np.abs(verts[:, 0]), *rules['clavicleMiddle'])
        keep = np.where(y < rules['headFrom'], keep, 1.0)
        for side in 'LR':
            taken = w[:, col[f'clavicle_{side}']] * (1.0 - keep)
            w[:, col[f'clavicle_{side}']] -= taken
            w[:, col['chest']] += taken

    # The neck above the shoulders: the weight of the clavicles and of the upper arms fades out
    # upward, so that a raised arm does not drag the side of the neck and the jaw.
    if 'armTop' in rules:
        keep = 1.0 - smoothstep(y, *rules['armTop'])
        for side in 'LR':
            for bone in ('clavicle', 'upper_arm'):
                taken = w[:, col[f'{bone}_{side}']] * (1.0 - keep)
                w[:, col[f'{bone}_{side}']] -= taken
                w[:, col['neck']] += taken

    # The top of the shoulder: above the heights of `y`, the share of the upper arm weight that a
    # vertex keeps grows from 0 at the distance x[0] from the middle plane to 1 at x[1], and the
    # clavicle of its side takes the rest. Thus the faces from the neck to the root of the arm
    # bend over several rings of faces, and no face spans the whole turn of a lowered arm.
    if 'shoulderRamp' in rules:
        rule = rules['shoulderRamp']
        above = smoothstep(y, *rule['y'])
        keep = 1.0 - (1.0 - smoothstep(np.abs(verts[:, 0]), *rule['x'])) * above
        for side, sign in (('L', 1.0), ('R', -1.0)):
            mine = verts[:, 0] * sign > 0
            taken = w[:, col[f'upper_arm_{side}']] * (1.0 - keep) * mine
            w[:, col[f'upper_arm_{side}']] -= taken
            w[:, col[f'clavicle_{side}']] += taken

    # The paw: the fingers keep a share of their weight, and the hand takes the rest.
    for side in 'LR':
        moved = w[:, col[f'fingers_{side}']] * (1.0 - rules['fingers'])
        w[:, col[f'fingers_{side}']] -= moved
        w[:, col[f'hand_{side}']] += moved

    # The knee (`knee`): bone heat on a short thick leg gives the shin the front of the knee and
    # the underside of the thigh above the knee joint, and these vertices stay upright with the
    # shin when the seated thigh turns forward. Each vertex splits its weight of the thigh and the
    # shin of its side by its height: the thigh share grows from 0 at the lower height to 1 at the
    # upper height, so that the knee bends on a band across the leg.
    if 'knee' in rules:
        share = smoothstep(y, *rules['knee']['height'])
        for side in 'LR':
            thigh, shin = col[f'thigh_{side}'], col[f'shin_{side}']
            leg = w[:, thigh] + w[:, shin]
            w[:, thigh] = leg * share
            w[:, shin] = leg * (1.0 - share)

    # The haunch: the thigh weight above the leg goes to the hips.
    share = smoothstep(y, *rules['haunch']['height'])
    for side in 'LR':
        taken = w[:, col[f'thigh_{side}']] * share
        w[:, col[f'thigh_{side}']] -= taken
        w[:, col['hips']] += taken

    if TAIL_TIP in BONES:
        w = tail_weights(verts, tris, w, rules['tail'], heads, ends)
    else:
        # The tail ball follows the tail only, and no other vertex follows the tail.
        ball = rules['tailBall']
        inside = np.linalg.norm(verts - ball['center'], axis=1) <= ball['radius']
        inside &= verts[:, 2] <= ball['behind']
        w[:, col['hips']] += np.where(inside, 0.0, w[:, col['tail']])
        w[:, col['tail']] = 0.0
        w[inside] = 0.0
        w[inside, col['tail']] = 1.0

    # The shoulders below the head line give the weight of the head to the neck, so that a turn
    # of the head does not pull them. The share grows from 0 at the smaller distance of
    # `shoulderHead` from the middle plane to all at the larger distance.
    if 'shoulderHead' in rules:
        share = smoothstep(np.abs(verts[:, 0]), *rules['shoulderHead']) * (y < rules['headFrom'])
        taken = w[:, col['head']] * share
        w[:, col['head']] -= taken
        w[:, col['neck']] += taken

    # The head: the eyes, the nose, and the whiskers follow the head only. Each ear follows its
    # ear bone above its base.
    above = y >= rules['headFrom']
    w[above] = 0.0
    w[above, col['head']] = 1.0
    ear = smoothstep(y, *rules['earBase'])
    for side, sign in (('L', 1.0), ('R', -1.0)):
        mine = above & (verts[:, 0] * sign > 0.01) & (ear > 0)
        w[mine, col[f'ear_{side}']] = ear[mine]
        w[mine, col['head']] = 1.0 - ear[mine]

    # A beak that opens (`jaw`): each vertex of the lower part of the beak, in the box of the rule
    # and below the mouth plane, follows the jaw only. The corners of the mouth lie on the plane,
    # so they stay on the head, and the lower part turns around the line between them.
    if 'jaw' in rules:
        rule = rules['jaw']
        lo, hi = np.asarray(rule['box'], float)
        lower = np.all((verts >= lo) & (verts <= hi), axis=1) & (y < rule['below'])
        w[lower] = 0.0
        w[lower, col[JAW]] = 1.0
        log(f'jaw: {int(lower.sum())} vertices of the lower beak follow the jaw, from y '
            f'{verts[lower, 1].min():.4f} to {verts[lower, 1].max():.4f} u')

    # A long nose that hangs below the head line in front of the chest, as the trunk and the tusks
    # of the elephant (`noseFront`): each vertex below the head line and in front of the plane
    # z = front follows the head only. Bone heat gives the lower nose to the chest and the spine,
    # and a turn of the head then bends the nose at the chin.
    if 'noseFront' in rules:
        nose = ~above & (verts[:, 2] > rules['noseFront']['front'])
        w[nose] = 0.0
        w[nose, col['head']] = 1.0
        log(f'nose: {int(nose.sum())} vertices in front of z {rules["noseFront"]["front"]} u '
            f'follow the head, the lowest at y {verts[nose, 1].min():.4f} u')

    # A hanging ear: the flap of each ear hangs down beside the head and the neck, past the head
    # line. Bone heat gives its lower part to the neck and the chest, and a turn of the head then
    # tears the flap from the head. Each vertex of the flap follows the head and its ear bone:
    # the share of the ear bone falls from 1 at the height hang[0] to 0 at hang[1], so that the
    # flap bends at its root, and the measures of the head of `pnpm studio-body` leave it out.
    if 'earFlap' in rules:
        rule = rules['earFlap']
        share = 1.0 - smoothstep(y, *rule['hang'])
        for side, sign in (('L', 1.0), ('R', -1.0)):
            flap = hanging_ear(verts, tris, rule, sign)
            w[flap] = 0.0
            w[flap, col[f'ear_{side}']] = share[flap]
            w[flap, col['head']] = 1.0 - share[flap]
            log(f'ear {side}: {int(flap.sum())} vertices of the hanging flap, the lowest at y '
                f'{verts[flap, 1].min():.4f} u, {int((share[flap] > 0.5).sum())} with the most '
                f'weight on the ear bone')
    return w


def tail_mask(weights):
    """Tells for each vertex if a tail bone moves it."""
    mask = weights[:, BONES.index('tail')] > 0
    if TAIL_TIP in BONES:
        mask |= weights[:, BONES.index(TAIL_TIP)] > 0
    return mask


def min_angles(verts, tris):
    """Gives the smallest corner angle of each face, in degrees."""
    out = np.full(len(tris), 180.0)
    for k in range(3):
        a, b, c = verts[tris[:, k]], verts[tris[:, (k + 1) % 3]], verts[tris[:, (k + 2) % 3]]
        u, v = b - a, c - a
        cos = np.sum(u * v, axis=1) / np.maximum(
            np.linalg.norm(u, axis=1) * np.linalg.norm(v, axis=1), 1e-12)
        out = np.minimum(out, np.degrees(np.arccos(np.clip(cos, -1.0, 1.0))))
    return out


def rigid_slivers(verts, tris, weights, rules):
    """Gives the corners of each thin face of the source one set of weights: the mean of the
    weights of the thin faces that share corners. A thin face has a corner angle below `sliver`.
    Its corners lie almost on one line, so a small difference of their weights turns the face
    over when a joint bends. With one set of weights, the face moves rigidly. The vertices of the
    head, the ears, and the tail ball keep the weights of their rules."""
    limit_angle = rules['sliver']['angle']
    edges = np.stack([np.linalg.norm(verts[tris[:, k]] - verts[tris[:, (k + 1) % 3]], axis=1)
                      for k in range(3)], axis=1).max(axis=1)
    thin = np.nonzero((min_angles(verts, tris) < limit_angle)
                      & (edges < rules['sliver']['longest']))[0]
    keep = (verts[:, 1] >= rules['headFrom']) | tail_mask(weights)
    parent = list(range(len(verts)))

    def root(v):
        while parent[v] != v:
            parent[v] = parent[parent[v]]
            v = parent[v]
        return v

    for f in thin:
        corners = [int(v) for v in tris[f] if not keep[v]]
        for v in corners[1:]:
            ra, rb = root(corners[0]), root(v)
            if ra != rb:
                parent[max(ra, rb)] = min(ra, rb)
    groups = {}
    for v in sorted({int(v) for f in thin for v in tris[f] if not keep[v]}):
        groups.setdefault(root(v), []).append(v)
    out = weights.copy()
    sizes = []
    for members in groups.values():
        if len(members) < 2:
            continue
        out[members] = weights[members].mean(axis=0)
        sizes.append(len(members))
    log(f'slivers: {len(thin)} faces below {limit_angle}°, {len(sizes)} groups of '
        f'{sum(sizes)} vertices, the largest {max(sizes, default=0)}')
    return out


def rigid_faces(verts, tris, weights, rules):
    """Gives the corners of single faces or of groups of faces one set of weights: the mean of
    their weights. `rigid` of the rules lists points in the units of the source, and the rule takes
    the face whose middle lies nearest to each point. A face at the edge of the plane of `armSplit`
    can get corners with upper arm weights that differ by 0.25, and it turns over when the arm
    hangs. With one set of weights, the face moves rigidly. An item of `rigid` can also be a list
    of points: the faces nearest to them take one mean, the mean of the weights of all their
    corners. Thus two thin faces that share corners both move rigidly, and the second face does
    not undo the first. A config with no `rigid` changes no weight."""
    out = weights.copy()
    middles = verts[tris].mean(axis=1)
    for item in rules.get('rigid', []):
        points = np.asarray(item, float).reshape(-1, 3)
        faces = [int(np.argmin(np.linalg.norm(middles - p, axis=1))) for p in points]
        corners = np.unique(tris[faces].ravel())
        change = np.abs(weights[corners] - weights[corners].mean(axis=0)).max()
        out[corners] = weights[corners].mean(axis=0)
        places = '; '.join(', '.join(f'{x:.4f}' for x in middles[f]) for f in faces)
        if len(faces) == 1:
            log(f'rigid: the face at ({places}) u takes the mean of the weights of its corners, '
                f'the largest change {change:.3f}')
        else:
            log(f'rigid: the {len(faces)} faces at ({places}) u take the mean of the weights of '
                f'their {len(corners)} corners, the largest change {change:.3f}')
    return out


def straight_slivers(verts, tris, weights, rules):
    """Gives the middle corner of each long thin face the weights of the line between its two
    other corners: the mix of their weights by the place of the middle corner along that line. A
    thin face whose middle corner lags behind the line turns over when a joint bends across it,
    as the faces along the elbow do. A face is such a face when one corner angle is above `angle`.
    The vertices of the tail keep the weights of their rules. The vertices of the head and of the
    ears keep them too, unless the rule has `head`: a long thin face of the jaw then folds less
    when the head turns against the neck."""
    limit_angle = rules['line']['angle']
    keep = tail_mask(weights)
    if not rules['line'].get('head', False):
        keep |= verts[:, 1] >= rules['headFrom']
    out = weights.copy()
    moved = 0
    for t in tris:
        for k in range(3):
            m, a, b = int(t[k]), int(t[(k + 1) % 3]), int(t[(k + 2) % 3])
            u, v = verts[a] - verts[m], verts[b] - verts[m]
            cos = u.dot(v) / max(np.linalg.norm(u) * np.linalg.norm(v), 1e-12)
            if keep[m] or math.degrees(math.acos(max(-1.0, min(1.0, cos)))) <= limit_angle:
                continue
            line = verts[b] - verts[a]
            along = float(np.clip((verts[m] - verts[a]).dot(line) / line.dot(line), 0.0, 1.0))
            out[m] = (1 - along) * out[a] + along * out[b]
            moved += 1
    log(f'lines: {moved} middle corners of faces with a corner angle above {limit_angle}°')
    return out


def edge_faces(tris):
    """Gives the faces of each edge, by the sorted pair of its corners."""
    out = {}
    for f, t in enumerate(tris):
        for k in range(3):
            out.setdefault(tuple(sorted((int(t[k]), int(t[(k + 1) % 3])))), []).append(f)
    return out


def corner_angle(p, a, b):
    """Gives the angle at the point `p` between the points `a` and `b`, in degrees."""
    u, v = a - p, b - p
    cos = u.dot(v) / max(np.linalg.norm(u) * np.linalg.norm(v), 1e-12)
    return math.degrees(math.acos(max(-1.0, min(1.0, cos))))


def segment_gap(a, b, c, d):
    """Gives the smallest distance between the segments ab and cd."""
    u, v, w = b - a, d - c, a - c
    uu, uv, vv, uw, vw = u.dot(u), u.dot(v), v.dot(v), u.dot(w), v.dot(w)
    det = uu * vv - uv * uv
    s = np.clip((uv * vw - vv * uw) / det, 0.0, 1.0) if det > 1e-18 else 0.0
    t = np.clip((uv * s + vw) / vv, 0.0, 1.0)
    s = np.clip((uv * t - uw) / uu, 0.0, 1.0)
    return float(np.linalg.norm(a + s * u - (c + t * v)))


def arm_mask(weights):
    """Tells for each vertex if an arm bone of a side moves it."""
    arm = np.zeros(len(weights), bool)
    for side in 'LR':
        for name in arm_bones(side):
            arm |= weights[:, BONES.index(name)] > 0
    return arm


def flip_edges(verts, bind, tris, uvs, weights, rule):
    """Flips the long edge of each thin face of the arms in the seated bind pose: the edge across
    a corner angle above `angle` in the bind mesh goes to the corner of the face on its other
    side. The bind pose bends the elbows, so a face across an elbow is thin in the bind mesh only.
    A flip needs the two faces almost on one plane in the source and in the bind mesh (normals
    within `normals` degrees), a move of the surface of at most `move` units in both, the two new
    faces on the side of the old faces in both, and a larger smallest corner angle in the bind
    mesh. An edge on a seam of the texture does not flip. Gives the new triangles and corner UVs,
    the number of flips, and the largest move of the surface (at the crossing of the two
    diagonals)."""
    tris, uvs = tris.copy(), uvs.copy()
    arm = arm_mask(weights)
    flips, largest = 0, 0.0
    for _ in range(rule.get('rounds', 4)):
        changed = False
        faces_of = edge_faces(tris)
        done = set()
        for f in range(len(tris)):
            if f in done or not arm[tris[f]].all():
                continue
            t = tris[f]
            angles = [corner_angle(bind[t[k]], bind[t[(k + 1) % 3]], bind[t[(k + 2) % 3]])
                      for k in range(3)]
            k = int(np.argmax(angles))
            if angles[k] <= rule['angle']:
                continue
            m, a, b = int(t[k]), int(t[(k + 1) % 3]), int(t[(k + 2) % 3])
            others = [g for g in faces_of[tuple(sorted((a, b)))] if g != f]
            if len(others) != 1 or others[0] in done or not arm[tris[others[0]]].all():
                continue
            g = others[0]
            n = int(next(v for v in tris[g] if v not in (a, b)))
            uv_f = {int(v): uvs[f][j] for j, v in enumerate(t)}
            uv_g = {int(v): uvs[g][j] for j, v in enumerate(tris[g])}
            if any(np.abs(uv_f[v] - uv_g[v]).max() > 1e-6 for v in (a, b)):
                continue
            # The face f is (m, a, b) in its order, so the face g holds (b, a, n) in its order.
            new = np.array([[m, a, n], [m, n, b]])
            fits, gap = True, 0.0
            for points in (verts, bind):
                old_normals = face_normals(points, tris[[f, g]])
                cos = float(old_normals[0].dot(old_normals[1]))
                gap = max(gap, segment_gap(points[a], points[b], points[m], points[n]))
                fits &= math.degrees(math.acos(max(-1.0, min(1.0, cos)))) <= rule['normals']
                fits &= bool((face_normals(points, new) @ old_normals.sum(axis=0) > 0).all())
            if not fits or gap > rule['move']:
                continue
            if min_angles(bind, new).min() <= min_angles(bind, tris[[f, g]]).min():
                continue
            uv_g[m] = uv_f[m]
            tris[f], tris[g] = new
            uvs[f] = [uv_f[m], uv_f[a], uv_g[n]]
            uvs[g] = [uv_f[m], uv_g[n], uv_f[b]]
            done.update((f, g))
            flips += 1
            largest = max(largest, gap)
            changed = True
        if not changed:
            break
    return tris, uvs, flips, largest


def arm_part(heads, joint):
    """Gives the length of the arm part that ends at a joint: the clavicle for the shoulder
    joint, the upper arm from the shoulder joint for the elbow, and the forearm from the elbow for
    the wrist. Each other joint takes the bone of its parent."""
    side = joint[-1]
    start = {'forearm': f'upper_arm_{side}', 'hand': f'forearm_{side}'}.get(joint[:-2],
                                                                          PARENTS[joint])
    return float(np.linalg.norm(heads[joint] - heads[start]))


def ring_radius(ring, heads, side):
    """Gives the radius of a ring at the joint of one side, in units: its `radius`, or else its
    `part` (by default `RING_PART`) of the arm part that ends at the joint (`arm_part()`), so that
    the ring grows with the arm factor. A ring of a leg joint needs its `radius`."""
    if 'radius' in ring:
        return ring['radius']
    if ring['joint'] in LEG:
        raise SystemExit(f"The ring of the leg joint {ring['joint']} needs a radius.")
    return ring.get('part', RING_PART) * arm_part(heads, f"{ring['joint']}_{side}")


def limb_bones(joint, side):
    """Gives the bones of the limb of a ring joint on one side: the leg bones of `LEG` for a leg
    joint, such as `shin` for the knee, and else the arm bones (`arm_bones()`)."""
    if joint in LEG:
        return [f'{b}_{side}' for b in LEG]
    return arm_bones(side)


def joint_plane(heads, ends, joint):
    """Gives the point and the unit normal of the plane of a ring at a joint: through the joint,
    at right angles to the mean direction of the bone before it and the bone after it."""
    point = heads[joint]
    return point, unit(unit(point - heads[PARENTS[joint]]) + unit(ends[joint] - point))


def ring_cuts(verts, tris, weights, heads, ends, ring, side):
    """Finds the edges that a ring of one joint cuts: the plane of `joint_plane()`, moved `offset`
    units along its normal (toward the child bone for a value above 0). An edge counts when both
    corners lie within the radius of the ring (`ring_radius()`) of the joint, a bone of the limb
    of the side (`limb_bones()`) moves one corner, it is at least `minEdge` long, and the plane
    cuts it at least `ends` of its length from each corner. With `toward` (a direction of the left
    side in the axes of the studio, mirrored for the right side) and `within` (degrees), the ring
    cuts only an arc: the direction from the joint to the cut, across the bone, turns at most
    `within` from `toward`. Gives the place of the cut along each edge, by the sorted pair of its
    corners."""
    joint = f"{ring['joint']}_{side}"
    point, normal = joint_plane(heads, ends, joint)
    near = np.linalg.norm(verts - point, axis=1) <= ring_radius(ring, heads, side)
    point = point + ring.get('offset', 0.0) * normal
    arm = np.zeros(len(verts), bool)
    for name in limb_bones(ring['joint'], side):
        arm |= weights[:, BONES.index(name)] > 0
    height = (verts - point) @ normal
    toward = None
    if 'toward' in ring:
        toward = np.array(ring['toward'], float) * (1.0 if side == 'L' else [-1.0, 1.0, 1.0])
        toward = unit(toward - (toward @ normal) * normal)
        least = math.cos(math.radians(ring['within']))
    cuts = {}
    for a, b in edge_faces(tris):
        if not (near[a] and near[b] and (arm[a] or arm[b])) or height[a] * height[b] >= 0:
            continue
        if np.linalg.norm(verts[a] - verts[b]) < ring.get('minEdge', 0.0):
            continue
        t = height[a] / (height[a] - height[b])
        if not ring.get('ends', 0.0) <= t <= 1.0 - ring.get('ends', 0.0):
            continue
        if toward is not None:
            across = (1 - t) * verts[a] + t * verts[b] - point
            across -= (across @ normal) * normal
            if across @ toward < least * np.linalg.norm(across):
                continue
        cuts[(a, b)] = float(t)
    return cuts


def split_faces(verts, tris, uvs, weights, cuts):
    """Splits each edge of `cuts` at its place, and each face with a cut edge into faces on its
    plane: two faces for one cut edge, three for two, and four for three. A new vertex takes the
    place, the UV of each face, and the weights of its place on the edge. A face keeps its index
    for its first part, and the other parts follow the faces. Gives the new vertices, triangles,
    corner UVs, weights, and the index of the face before the split of each face."""
    index = {}
    new_verts, new_weights = [verts], [weights]
    for (a, b), t in sorted(cuts.items()):
        index[(a, b)] = len(verts) + len(index)
        new_verts.append([(1 - t) * verts[a] + t * verts[b]])
        new_weights.append([(1 - t) * weights[a] + t * weights[b]])
    out_tris, out_uvs, extra_tris, extra_uvs, extra_origin = [], [], [], [], []
    for f, t in enumerate(tris):
        uv = {int(v): uvs[f][j] for j, v in enumerate(t)}
        mids = {}
        for k in range(3):
            a, b = int(t[k]), int(t[(k + 1) % 3])
            key = tuple(sorted((a, b)))
            if key in index:
                s = cuts[key] if key == (a, b) else 1.0 - cuts[key]
                mids[k] = index[key]
                uv[index[key]] = (1 - s) * uv[a] + s * uv[b]
        parts = split_triangle([int(v) for v in t], mids, np.concatenate(new_verts))
        out_tris.append(parts[0])
        out_uvs.append([uv[v] for v in parts[0]])
        extra_tris += parts[1:]
        extra_uvs += [[uv[v] for v in p] for p in parts[1:]]
        extra_origin += [f] * (len(parts) - 1)
    tris_out = np.array(out_tris + extra_tris, np.int64)
    uvs_out = np.array(out_uvs + extra_uvs)
    origin = np.concatenate([np.arange(len(tris)), np.array(extra_origin, np.int64)])
    return np.concatenate(new_verts), tris_out, uvs_out, np.concatenate(new_weights), origin


def split_triangle(t, mids, points):
    """Splits the triangle `t` (three corners in order) at the new vertices `mids` of its edges
    (the edge k goes from the corner k to the corner k + 1). A quad takes its shorter diagonal.
    Gives the parts, in the order of the corners."""
    a, b, c = t
    if not mids:
        return [t]
    if len(mids) == 1:
        k = next(iter(mids))
        p, (u, v, w) = mids[k], (t[k], t[(k + 1) % 3], t[(k + 2) % 3])
        return [[u, p, w], [p, v, w]]
    if len(mids) == 3:
        p, q, r = mids[0], mids[1], mids[2]
        return [[a, p, r], [p, b, q], [r, q, c], [p, q, r]]
    # Two cut edges: the corner between them is alone on one side of the cut.
    k = next(j for j in range(3) if j in mids and (j + 2) % 3 in mids)
    u, v, w = t[k], t[(k + 1) % 3], t[(k + 2) % 3]
    p, q = mids[k], mids[(k + 2) % 3]
    if np.linalg.norm(points[p] - points[w]) <= np.linalg.norm(points[v] - points[q]):
        return [[u, p, q], [p, v, w], [p, w, q]]
    return [[u, p, q], [p, v, q], [v, w, q]]


def point_flips(source, bind, tris, uvs, rule):
    """Flips the edge nearest to each point of `points` to the other diagonal of its two faces
    (design 4.4). A quad of an arm tube can split along its short diagonal in the source, and the
    bent elbow of the seated bind can shear it, so that the diagonal becomes the long one. Its
    thin face then folds when the elbow bends further. The points are in the units of the source,
    as the points of `rigid`. The edge flips when its middle in `source` lies within `near` units
    of the point, two faces share it, the two corners across it sum to more than 180 degrees in
    the bind, no seam of the texture runs along it, and the new faces keep the side of the old
    faces in the source and in the bind. Gives the new triangles and corner UVs, and the number
    of flips. A flip keeps the index of each of its two faces."""
    tris, uvs = tris.copy(), uvs.copy()
    flips = 0
    for point in np.asarray(rule['points'], float).reshape(-1, 3):
        faces_of = edge_faces(tris)
        pairs = [key for key, faces in faces_of.items() if len(faces) == 2]
        middles = np.array([(source[a] + source[b]) / 2 for a, b in pairs])
        k = int(np.argmin(np.linalg.norm(middles - point, axis=1)))
        place = ', '.join(f'{x:.4f}' for x in point)
        gap = float(np.linalg.norm(middles[k] - point))
        if gap > rule['near']:
            warn(f'point flips: no edge within {rule["near"]} u of ({place}) u, the nearest '
                 f'{gap:.4f} u')
            continue
        f, g = faces_of[pairs[k]]
        t = [int(v) for v in tris[f]]
        m = next(v for v in t if v not in pairs[k])
        # The face f is (m, a, b) in its order, so the face g holds (b, a, n).
        a, b = t[(t.index(m) + 1) % 3], t[(t.index(m) + 2) % 3]
        n = int(next(v for v in tris[g] if v not in (a, b)))
        across = (corner_angle(bind[m], bind[a], bind[b])
                  + corner_angle(bind[n], bind[a], bind[b]))
        uv_f = {int(v): uvs[f][j] for j, v in enumerate(tris[f])}
        uv_g = {int(v): uvs[g][j] for j, v in enumerate(tris[g])}
        new = np.array([[m, a, n], [m, n, b]])
        fits = across > 180.0 and all(np.abs(uv_f[v] - uv_g[v]).max() <= 1e-6 for v in (a, b))
        for points in (source, bind):
            old = face_normals(points, tris[[f, g]]).sum(axis=0)
            fits &= bool((face_normals(points, new) @ old > 0).all())
        if not fits:
            warn(f'point flips: the edge at ({place}) u does not flip, the corners across it '
                 f'sum to {across:.1f} degrees in the bind')
            continue
        uv_g[m] = uv_f[m]
        tris[f], tris[g] = new
        uvs[f] = [uv_f[m], uv_f[a], uv_g[n]]
        uvs[g] = [uv_f[m], uv_g[n], uv_f[b]]
        flips += 1
        log(f'point flips: the edge at ({place}) u flips, the corners across it sum to '
            f'{across:.1f} degrees in the bind')
    return tris, uvs, flips


def refine(verts, tris, uvs, weights, heads, ends, matrices, config, source):
    """Changes the faces of the arms and the legs so that they bend at the joints (design 4.4),
    by the rule `refine` of the config: first the flips of the edges at the points of `pointFlip`
    (`point_flips()`), then a ring of new vertices at each joint of `rings`, if the rule has any
    (`ring_cuts()`, `split_faces()`), on the sides of its `sides` or on both sides, then the flips
    of the long edges of the faces that are thin in the seated bind pose of `bind_skin()`
    (`flip_edges()`). Each ring splits the faces that the rings before it made, so that two rings
    can cut one long edge. The cuts keep the surface, and each new vertex keeps four bones. The
    flips of `pointFlip` name their points in `source`, the source before the stretch of the
    limbs. Gives
    the new vertices, triangles, corner UVs, and weights, the number of flips, the largest move of
    a flip, the number of cut edges, and the index of the face before the refine of each face. A
    flip keeps the index of each of its two faces."""
    rule = config['refine']
    origin = np.arange(len(tris))
    count = 0
    if 'pointFlip' in rule:
        tris, uvs, named = point_flips(source, bind_skin(config, weights, matrices, verts), tris,
                                       uvs, rule['pointFlip'])
        log(f"point flips: {named} of {len(rule['pointFlip']['points'])} edges")
    for ring in rule.get('rings', ()):
        cuts = {}
        for side in ring.get('sides', 'LR'):
            cuts.update(ring_cuts(verts, tris, weights, heads, ends, ring, side))
        if cuts:
            verts, tris, uvs, weights, step = split_faces(verts, tris, uvs, weights, cuts)
            origin = origin[step]
            weights = limit(weights)
            count += len(cuts)
    tris, uvs, flips, largest = flip_edges(verts, bind_skin(config, weights, matrices, verts),
                                           tris, uvs, weights, rule['flip'])
    return verts, tris, uvs, weights, flips, largest, count, origin


def shortest_edges(points, tris):
    """Gives the length of the shortest edge of each face."""
    edges = [np.linalg.norm(points[tris[:, (k + 1) % 3]] - points[tris[:, k]], axis=1)
             for k in range(3)]
    return np.minimum(np.minimum(edges[0], edges[1]), edges[2])


def stretch_faces(source, long, tris):
    """Finds the faces that the stretch of the limbs, the head, and the neck turns or squeezes:
    each face whose normal turns more than `STRETCH_TURN` degrees from the source to the
    long-armed source, or whose shortest edge keeps less than `STRETCH_EDGE` of its length. Such a
    face can fold in each pose, as the throat face that the linear stretch of the arms pulls
    across the middle of the fox. Gives the index, the turn in degrees, and the kept part of the
    shortest edge of each face, by index."""
    dots = np.sum(face_normals(source, tris) * face_normals(long, tris), axis=1)
    turn = np.degrees(np.arccos(np.clip(dots, -1.0, 1.0)))
    kept = shortest_edges(long, tris) / np.maximum(shortest_edges(source, tris), 1e-12)
    found = np.nonzero((turn > STRETCH_TURN) | (kept < STRETCH_EDGE))[0]
    return [(int(f), float(turn[f]), float(kept[f])) for f in found]


def uncut_faces(verts, tris, heads, ends, rule):
    """Finds the long thin faces across an arm joint that no ring cuts: each face with a smallest
    corner angle below `angle` of the rule `check.thin` and a longest edge of at least `length`,
    whose longest edge crosses the plane of a ring at the joint (`joint_plane()`) within `near` of
    the joint. A ring splits each edge that it cuts at the plane, so a face that a ring cut has no
    edge across the plane. A fixed radius of a ring can miss the faces of a longer arm, as at the
    elbows of the fox with the arm factor 1.35. Gives the index, the joint, the smallest corner
    angle, the longest edge, and the distance of the crossing from the joint of each face, by
    joint in the order of `ARM_JOINTS` with the left side first."""
    angles = min_angles(verts, tris)
    corners = [verts[tris[:, k]] for k in range(3)]
    edges = np.stack([np.linalg.norm(corners[(k + 2) % 3] - corners[(k + 1) % 3], axis=1)
                      for k in range(3)], axis=1)
    wide = edges.argmax(axis=1)
    rows = np.arange(len(tris))
    a = np.stack(corners, axis=1)[rows, (wide + 1) % 3]
    b = np.stack(corners, axis=1)[rows, (wide + 2) % 3]
    longest = edges[rows, wide]
    thin = (angles < rule['angle']) & (longest >= rule['length'])
    found = []
    for bone, name in ARM_JOINTS:
        for side in 'LR':
            point, normal = joint_plane(heads, ends, f'{bone}_{side}')
            ha, hb = (a - point) @ normal, (b - point) @ normal
            across = thin & (ha * hb < 0)
            t = ha / np.where(across, ha - hb, 1.0)
            gap = np.linalg.norm(a + t[:, None] * (b - a) - point, axis=1)
            for f in np.nonzero(across & (gap <= rule['near']))[0]:
                found.append((int(f), f'{name} {side}', float(angles[f]), float(longest[f]),
                              float(gap[f])))
    return found


def module_faces(order, materials):
    """Gives the index in the module of `pnpm studio-body` of each face before the walk order, as
    `pnpm fold-probe` counts the faces: the export reads the fur faces, then the gloss faces, each
    in the order of the file. `order` gives the walk order, and `materials` the material of each
    face in the walk order."""
    rank = np.full(len(order), -1)
    k = 0
    for name in ('fur', 'gloss'):
        for p in np.nonzero(materials == name)[0]:
            rank[p] = k
            k += 1
    position = np.empty(len(order), int)
    position[order] = np.arange(len(order))
    return rank[position]


def face_corners(verts, long_verts, source_tris, count, order, materials):
    """Gives the corners of the source face of each face of the module of `pnpm studio-body`, in
    the units of the source (`s`) and in the long-armed source (`l`), for `pnpm arm-look`: a face
    of the rig keeps the index of its source face, as in `face_sources()`. The other parts of a
    face that a ring splits give None, and a face of an eye shell gives 'eye'."""
    index = module_faces(order, materials)
    out = [None] * len(order)
    for f in range(min(count, len(source_tris))):
        out[int(index[f])] = {'s': np.round(verts[source_tris[f]], 5).tolist(),
                              'l': np.round(long_verts[source_tris[f]], 5).tolist()}
    for f in range(count, len(order)):
        out[int(index[f])] = 'eye'
    return out


def face_sources(verts, source_tris, count, order, materials):
    """Gives the middle of each face of the module of `pnpm studio-body` in the units of the
    source, as `rigid` of the weight rules takes it (`rigid_faces()`): the middle of the source face
    that the face of the rig comes from. A face of the rig keeps the index of its source face, and a
    face that a ring splits keeps it for its first part. The other parts of a split face have no
    source face, and give None. A face of an eye shell gives 'eye', because the export drops the
    eye shells for the pea eyes. `count` is the number of faces of the rig before the eye shells,
    `order` the walk order, and `materials` the material of each face in the walk order."""
    index = module_faces(order, materials)
    out = [None] * len(order)
    for f in range(min(count, len(source_tris))):
        out[int(index[f])] = [round(float(x), 4) + 0.0 for x in verts[source_tris[f]].mean(axis=0)]
    for f in range(count, len(order)):
        out[int(index[f])] = 'eye'
    return out


#: The most faces of each list of the check that the log prints.
CHECK_LINES = 30


def log_check(stretched, uncut, index, bones, rule):
    """Prints the faces of `stretch_faces()` and of `uncut_faces()`, at most `CHECK_LINES` of each
    list, with the index of the face in the module (`module_faces()`) and its main bone. A face
    that a ring splits keeps its index for its first part."""
    log(f'stretch: {len(stretched)} faces turn more than {STRETCH_TURN:g}° or keep less than '
        f'{STRETCH_EDGE:g} of the shortest edge from the source to the long-armed source')
    for f, turn, kept in stretched[:CHECK_LINES]:
        log(f'  face {index[f]} ({BONES[bones[f]]}): turn {turn:.1f}°, shortest edge {kept:.2f}')
    if len(stretched) > CHECK_LINES:
        log(f'  and {len(stretched) - CHECK_LINES} more')
    log(f'uncut: {len(uncut)} long thin faces across an arm joint with no ring (corner below '
        f"{rule['angle']}°, longest edge from {rule['length']} u, the plane of the joint within "
        f"{rule['near']} u)")
    for f, joint, angle, length, gap in uncut[:CHECK_LINES]:
        log(f'  {joint}: face {index[f]} ({BONES[bones[f]]}), {angle:.1f}°, {length:.3f} u, '
            f'{gap:.3f} u from the joint')
    if len(uncut) > CHECK_LINES:
        log(f'  and {len(uncut) - CHECK_LINES} more')


def weight_steps(row):
    """Splits weights that add up to 1 into whole steps of 1/255, as `weightSteps()` of
    `src/models/studio-format.ts`: each weight rounds down, and the largest remainders get one
    more step."""
    exact = row / row.sum() * WEIGHT_STEPS
    steps = np.floor(exact)
    order = sorted(range(len(row)), key=lambda i: (-(exact[i] - steps[i]), i))
    missing = int(WEIGHT_STEPS - steps.sum())
    for i in order[:missing]:
        steps[i] += 1
    return steps


def placed_weights(verts, old_verts, old_tris, old_weights):
    """Gives each vertex the weights of its place on an old mesh (`weightSource` of the config): a
    vertex at the place of an old vertex takes its weights, and each other vertex the mix of the
    weights of the corners of the old face on which it lies, by its place on the face. A planar
    split of the faces, such as `tools/blender/panda_edge.py`, puts each new vertex on an old face,
    so the old vertices keep their weights and the skin of the old surface stays. Gives the
    weights and the count of the vertices at old places."""
    weights = np.zeros((len(verts), old_weights.shape[1]))
    kept = 0
    for v, point in enumerate(verts):
        gaps = np.linalg.norm(old_verts - point, axis=1)
        k = int(np.argmin(gaps))
        if gaps[k] < 1e-6:
            weights[v] = old_weights[k]
            kept += 1
            continue
        face, share = face_place(old_verts, old_tris, point)
        weights[v] = share @ old_weights[old_tris[face]]
    return limit(weights), kept


def face_place(verts, tris, point):
    """Gives the face of a mesh on which a point lies, and the shares of its three corners at the
    point. Raises an error when the point is more than 1e-5 units from each face."""
    a, b, c = verts[tris[:, 0]], verts[tris[:, 1]], verts[tris[:, 2]]
    u, w, p = b - a, c - a, point - a
    uu, uw, ww = (u * u).sum(axis=1), (u * w).sum(axis=1), (w * w).sum(axis=1)
    pu, pw = (p * u).sum(axis=1), (p * w).sum(axis=1)
    det = np.maximum(uu * ww - uw * uw, 1e-18)
    s = np.clip((ww * pu - uw * pw) / det, 0.0, 1.0)
    t = np.clip((uu * pw - uw * pu) / det, 0.0, 1.0)
    over = s + t > 1.0
    s, t = np.where(over, s / (s + t), s), np.where(over, t / (s + t), t)
    gaps = np.linalg.norm(a + s[:, None] * u + t[:, None] * w - point, axis=1)
    face = int(np.argmin(gaps))
    if gaps[face] > 1e-5:
        raise SystemExit(f'weightSource: the vertex at {point} lies {gaps[face]:.6f} u from the '
                         'nearest face of the old mesh.')
    return face, np.array([1.0 - s[face] - t[face], s[face], t[face]])


def limit(weights):
    """Keeps the four largest weights of each vertex, in steps of 1/255 that add up to 1."""
    out = np.zeros_like(weights)
    for v, row in enumerate(weights):
        keep = sorted(np.nonzero(row > 1e-4)[0], key=lambda k: (-row[k], k))[:INFLUENCES]
        steps = weight_steps(row[keep])
        for k, s in zip(keep, steps):
            if s > 0:
                out[v, k] = s / WEIGHT_STEPS
    return out


def skin(weights, matrices, points):
    """Moves points with linear blend skinning: each matrix is (3 × 4), rotation and move."""
    out = np.zeros_like(points)
    for k, m in enumerate(matrices):
        w = weights[:, k]
        if not w.any():
            continue
        out += w[:, None] * (points @ m[:, :3].T + m[:, 3])
    return out


def quat_product(a, b):
    """Gives the products of the quaternions (x, y, z, w) of two arrays (n × 4), row by row."""
    av, aw, bv, bw = a[:, :3], a[:, 3:], b[:, :3], b[:, 3:]
    return np.concatenate([aw * bv + bw * av + np.cross(av, bv),
                           aw * bw - np.sum(av * bv, axis=1, keepdims=True)], axis=1)


def dual_skin(weights, matrices, points):
    """Moves points with dual quaternion skinning: each (3 × 4) matrix becomes a unit dual
    quaternion, each vertex takes the sum of the dual quaternions of its bones by its weights,
    with the sign of each real part on the side of the real part of its largest weight, and the
    sum, made a unit, gives a turn and a move. A vertex between two bones thus turns by a part
    of the turn between them around the joint, and does not sink toward it as with
    `skin()`."""
    real = np.array([matrix_quat(m[:, :3]) for m in matrices])
    moves = np.array([[*m[:, 3], 0.0] for m in matrices])
    dual = 0.5 * quat_product(moves, real)
    pivot = real[np.argmax(weights, axis=1)]
    signed = weights * np.sign(pivot @ real.T + 1e-12)
    r = signed @ real
    d = signed @ dual
    size = np.linalg.norm(r, axis=1, keepdims=True)
    r, d = r / size, d / size
    v, w = r[:, :3], r[:, 3:]
    vd, wd = d[:, :3], d[:, 3:]
    shift = 2.0 * (w * vd - wd * v + np.cross(v, vd))
    turned = points + 2.0 * w * np.cross(v, points) + 2.0 * np.cross(v, np.cross(v, points))
    return turned + shift


def bind_skin(config, weights, matrices, points):
    """Moves the points of the long-armed source to the upright seated bind pose with the blend
    of `bind.blend` of the config. With no rule or with `linear`, each vertex takes `skin()`
    (linear blend skinning). With `dq`, each vertex of an arm root (a weight on an upper arm and
    none on a lower bone of an arm) takes `dual_skin()`, and the other vertices keep `skin()`.
    With `ramp` (two upper arm weights), the share of `dual_skin()` grows from 0 to 1 over the
    ramp, by the upper arm weight. The linear blend moves a vertex between two bones that turn
    by the angle a toward the joint, to about cos(a / 2) of its radius, and the dual quaternion
    blend keeps the radius. The app moves the bind mesh with linear blend skinning in each pose,
    and the corrective shapes give the source back in the clip `reference`.

    With `bind.knee` set to `dq`, each vertex with a weight on both the thigh and the shin of one
    side takes `dual_skin()` too, whatever `bind.blend` is. The seated bind bends each knee by
    about 85 degrees, so the linear blend puts the front of the rebuilt knee of the polar bear on
    a flat bevel at 0.83 of the round of the leg, and the knee is 0.120 units deep on its bisector,
    against 0.148 in the source. With `dq`, a ring at the knee turns by its share of the bend and
    keeps its radius, so the knee front is round and the back of the knee folds into a crease.

    With `bind.arm` set to `dq`, each vertex with a weight on a lower bone of an arm of a side of
    `bind.armSides` (both sides by default) takes `dual_skin()` too, whatever `bind.blend` is:
    the forearm and its segments, the elbow and wrist helpers, the paw, and the fingers. The
    seated bind of the cat bends each elbow by about 79 degrees and turns the left paw 120 degrees
    (`bindSupination`), so the linear blend puts the elbow at 0.86 and the forearm at 0.84 of the
    radius of the source tube, and the upper arm reads as a bulge between a thin elbow and a thin
    forearm. With `dq`, the ring of an inner elbow keeps its radius, so an arm that bends further
    than the bind folds the inner elbow."""
    rule = config.get('bind', {})
    blend = rule.get('blend', 'linear')
    if blend not in ('linear', 'dq'):
        raise SystemExit(f'bind.blend must be "linear" or "dq", not "{blend}".')
    for key in ('knee', 'arm'):
        if rule.get(key, 'linear') not in ('linear', 'dq'):
            raise SystemExit(f'bind.{key} must be "linear" or "dq", not "{rule[key]}".')
    out = skin(weights, matrices, points)
    sides = rule.get('armSides', 'LR')
    if any(side not in ('L', 'R') for side in sides):
        raise SystemExit(f'bind.armSides takes the sides L and R, not "{sides}".')
    if rule.get('arm') == 'dq':
        for side in sides:
            lower = [BONES.index(name) for name in arm_bones(side)
                     if not name.startswith('upper_arm')]
            low = weights[:, lower].sum(axis=1) > 0
            out[low] = dual_skin(weights[low], matrices, points[low])
    if rule.get('knee') == 'dq':
        for side in 'LR':
            thigh, shin = BONES.index(f'thigh_{side}'), BONES.index(f'shin_{side}')
            knee = (weights[:, thigh] > 0) & (weights[:, shin] > 0)
            out[knee] = dual_skin(weights[knee], matrices, points[knee])
    if blend == 'linear':
        return out
    upper = [BONES.index(f'upper_arm_{side}') for side in 'LR']
    lower = [BONES.index(f'{bone}_{side}') for bone in ARM[1:] for side in 'LR']
    low, high = config['bind'].get('ramp', [0.0, 0.0])
    share = (np.ones(len(points)) if high <= 0 else
             smoothstep(weights[:, upper].sum(axis=1), low, high))
    near = ((weights[:, upper].sum(axis=1) > 0) & (weights[:, lower].sum(axis=1) == 0)
            & (share > 0))
    dual = dual_skin(weights[near], matrices, points[near])
    out[near] += share[near, None] * (dual - out[near])
    return out


def move(rotation, src, dst):
    """Gives the (3 × 4) matrix that turns a point around `src` and moves `src` to `dst`."""
    return np.concatenate([rotation, (dst - rotation @ src)[:, None]], axis=1)


def stretch(verts, weights, heads, ends, children, factors, rules):
    """Makes the limbs longer, the head larger, the neck and the trunk shorter, and the trunk wider
    by the factors of the config: `arm`, `leg`, `head`, `neck`, `trunk`, and `girth` (the rows of
    the width, the front, and the back along the trunk axis), `armGirth` (the upper arm and the
    forearm), and `legGirth` (the thigh and the shin). The upper
    arm and the forearm of each side grow by `arm` along their axes from the shoulder joint out,
    and the paw moves with the wrist and keeps its size. With `armGirth`, the upper arm and the
    forearm take its two factors across their axes before the skin (`arm_girth()`), and with
    `legGirth`, the thigh and the shin (`leg_girth()`). A point on the inner side of the shoulder
    joint does not move with the upper arm. With a ramp (`weights.stretchRamp` of the config, in units), only the free arm
    beyond the plane |x| = `armSplit` stretches with the upper arm: the share of the stretch fades
    from 0 to 1 over the ramp on each side of the plane, so that the trunk beside and below the
    armpit keeps its form. The thigh and the shin grow by `leg` along their axes, the shin by
    `shin` when the config gives `shinFactor`, and the foot moves with the ankle and keeps its
    size. The head and the ears grow by `head` around the neck
    joint. The neck takes `neck` between its joints,
    and the head and the ears move along the neck by the move of the head joint, so that the neck
    of the rig is `neck` times the neck of the grown head. The trunk takes `trunk` between the hips
    joint and the joint `trunkTop` (the neck joint by default), and each other bone moves with it as
    a whole (`trunk_moves()`). The
    vertices of the trunk and of the clavicles take `girth` across the trunk axis, by their height
    along it, and each other bone moves as a whole with its joint (`girth_moves()`). Then the body
    rises by the growth of the legs, so that the soles stay at y = 0. The root stays on the floor. Each vertex blends the
    moves of its bones by its weights, so that a growth fades over the joint at its start. Gives
    the moved vertices, heads, and tails, the rise of the body, the drop of the head along the
    neck, and the move of the neck joint by the trunk factor."""
    new_heads = {k: v.copy() for k, v in heads.items()}
    new_ends = {k: v.copy() for k, v in ends.items()}
    if tuple(factors.get('legGirth', (1, 1))) != (1, 1):
        verts = leg_girth(verts, heads, *factors['legGirth'], tail_share(weights))
    if tuple(factors.get('armGirth', (1, 1))) != (1, 1):
        verts = arm_girth(verts, weights, heads, *factors['armGirth'])
    matrices = [move(np.eye(3), np.zeros(3), np.zeros(3)) for _ in BONES]
    halves = {}

    for side in 'LR':
        factor = factors['arm']
        s = heads[f'upper_arm_{side}']
        e = heads[f'forearm_{side}']
        wrist = heads[f'hand_{side}']
        e2 = s + factor * (e - s)
        wrist2 = e2 + factor * (wrist - e)
        for name, origin, start, axis in (
            ('forearm', e, e2, wrist - e),
            ('forearm_twist', e, e2, wrist - e),
        ):
            y = unit(axis)
            scale = np.eye(3) + (factor - 1) * np.outer(y, y)
            matrices[BONES.index(f'{name}_{side}')] = move(scale, origin, start)
        # The upper arm stretches from the shoulder joint out. A point of the trunk on the inner
        # side of the shoulder joint keeps its place, so that a small arm weight on the throat or
        # the chest does not pull it across the middle.
        share = np.ones(len(verts))
        ramp = rules.get('stretchRamp')
        if ramp:
            sign = 1.0 if side == 'L' else -1.0
            split = rules['armSplit']
            share = smoothstep(verts[:, 0] * sign, split - ramp, split + ramp)
        halves[BONES.index(f'upper_arm_{side}')] = (s, unit(e - s), factor, share)
        shift = wrist2 - wrist
        for name in ('hand', 'fingers'):
            matrices[BONES.index(f'{name}_{side}')] = move(np.eye(3), np.zeros(3), shift)
        new_heads[f'forearm_{side}'] = e2
        new_heads[f'forearm_twist_{side}'] = e2 + factor * (heads[f'forearm_twist_{side}'] - e)
        new_heads[f'hand_{side}'] = wrist2
        new_heads[f'fingers_{side}'] = heads[f'fingers_{side}'] + shift
        new_ends[f'fingers_{side}'] = ends[f'fingers_{side}'] + shift

    rise = 0.0
    # The thigh and the shin stretch only between their joints (segment_stretch), so that the
    # haunch above the hip and the sole below the ankle do not move with the stretch. The shin
    # takes its own factor when the config gives one.
    segments = {}
    if factors['leg'] != 1 or factors['shin'] != factors['leg']:
        factor, shin = factors['leg'], factors['shin']
        for side in 'LR':
            hip = heads[f'thigh_{side}']
            knee = heads[f'shin_{side}']
            ankle = heads[f'foot_{side}']
            knee2 = hip + factor * (knee - hip)
            ankle2 = knee2 + shin * (ankle - knee)
            for name, origin, start, end, f in (('thigh', hip, hip, knee, factor),
                                                ('shin', knee, knee2, ankle, shin)):
                segments[BONES.index(f'{name}_{side}')] = (origin, start, end, f)
            shift = ankle2 - ankle
            for name in ('foot', 'toes'):
                matrices[BONES.index(f'{name}_{side}')] = move(np.eye(3), np.zeros(3), shift)
            new_heads[f'shin_{side}'] = knee2
            new_heads[f'foot_{side}'] = ankle2
            new_heads[f'toes_{side}'] = heads[f'toes_{side}'] + shift
            new_ends[f'toes_{side}'] = ends[f'toes_{side}'] + shift
            rise = -float(shift[1])

    # The neck stretches only between its joints too, and the head and the ears move with the
    # head joint: the head grows around the neck joint, then moves down the grown neck.
    drop = np.zeros(3)
    if factors['head'] != 1 or factors['neck'] != 1:
        factor = factors['head']
        pivot = heads['neck']
        drop = factor * (factors['neck'] - 1) * (heads['head'] - pivot)
        for name in ('head', 'ear_L', 'ear_R') + ((JAW,) if JAW in BONES else ()):
            matrices[BONES.index(name)] = move(factor * np.eye(3), pivot, pivot + drop)
            new_heads[name] = pivot + factor * (heads[name] - pivot) + drop
            if not children[name]:
                new_ends[name] = pivot + factor * (ends[name] - pivot) + drop
        if factors['neck'] != 1:
            segments[BONES.index('neck')] = (pivot, pivot, heads['head'], factors['neck'])

    # The trunk shortens between the hips joint and the joint `trunkTop`. The other bones move
    # with the trunk as a whole, after their own stretch.
    lower = np.zeros(3)
    shifts = {}
    if factors['trunk'] != 1:
        segment, moves = trunk_moves(heads, factors['trunk'], factors['trunkTop'])
        lower = moves['neck']
        for name, shift in moves.items():
            k = BONES.index(name)
            shifts[k] = shift
            matrices[k][:, 3] += shift
            new_heads[name] = new_heads[name] + shift
            if not children[name]:
                new_ends[name] = new_ends[name] + shift
        for name in TRUNK:
            segments[BONES.index(name)] = segment
            new_heads[name] = segment_stretch(heads[name][None, :], *segment)[0]

    # The trunk grows wider and deeper across its axis. The other bones move out with their
    # joints, after the trunk factor: the girth moves are across the axis, and the trunk factor
    # moves along it, so the order does not change the result.
    wide = {}
    if any(tuple(row[1:]) != (1, 1, 1) for row in factors['girth']):
        widen, moves = girth_moves(heads, factors['girth'])
        for name, shift in moves.items():
            k = BONES.index(name)
            shifts[k] = shifts.get(k, np.zeros(3)) + shift
            matrices[k][:, 3] += shift
            new_heads[name] = new_heads[name] + shift
            if not children[name]:
                new_ends[name] = new_ends[name] + shift
        for name in GIRTH:
            wide[BONES.index(name)] = True
            new_heads[name] = new_heads[name] + widen(heads[name][None, :])[0] - heads[name]
        wide_verts = widen(verts)

    for name in BONES:
        if children[name]:
            new_ends[name] = new_heads[children[name]]
    up = np.array([0.0, rise, 0.0])
    if rise:
        for m in matrices:
            m[:, 3] += up
        for name in BONES:
            if name != 'root':
                new_heads[name] = new_heads[name] + up
                new_ends[name] = new_ends[name] + up
    for k in (*segments, *halves):
        matrices[k] = np.zeros((3, 4))
    plain = [np.zeros((3, 4)) if k in wide else m for k, m in enumerate(matrices)]
    out = skin(weights, plain, verts)
    if wide:
        out += skin(weights, [m if k in wide else np.zeros((3, 4))
                              for k, m in enumerate(matrices)], wide_verts)
    for k, (origin, start, end, factor) in segments.items():
        points = wide_verts if k in wide else verts
        moved = segment_stretch(points, origin, start, end, factor) + up
        if k in shifts:
            moved += shifts[k]
        out += weights[:, k, None] * moved
    for k, (origin, axis, factor, share) in halves.items():
        moved = outward_stretch(verts, origin, axis, factor, share) + up
        if k in shifts:
            moved += shifts[k]
        out += weights[:, k, None] * moved
    return out, new_heads, new_ends, rise, drop, lower


def trunk_moves(heads, factor, top='neck'):
    """Gives the moves of the trunk factor. The trunk bones shorten by `factor` along the line from
    the hips joint to the joint `top` (`trunkTop` of the config, the neck joint by default) with
    `segment_stretch()`: a point before the hips joint keeps its place, a point between the joints
    moves by its place along the line, and a point beyond `top` moves by the whole drop of `top`.
    So the trunk keeps its width and its depth, and the faces of the belly keep their colors and
    become shorter along the trunk. With the chest joint as `top`, the upper chest, the shoulders,
    and the arm roots keep their form and move as a whole. Each other bone moves as a whole with
    the point of the line at the head of the first bone of its chain after the trunk: the neck,
    the head, and the ears with the neck joint, and each arm with its clavicle joint. The chains of
    the hips bone keep their places: each leg, and the tail, which grows from the pelvis, so that
    the tail and the haunch under it stay on the seat. So the head, the arms, the legs, and the
    tail keep their sizes, and a vertex with weights on the trunk and on another bone blends two
    moves of nearly the same size. Gives the segment of the trunk bones (the head, the moved head,
    the end, and the factor) and the move of each other bone by its name, with no move of the
    root."""
    segment = (heads['hips'], heads['hips'], heads[top], factor)
    moves = {}
    for name in BONES:
        if name in TRUNK or PARENTS[name] is None:
            continue
        first = name
        while PARENTS[first] not in TRUNK:
            first = PARENTS[first]
        if PARENTS[first] == 'hips':
            moves[name] = np.zeros(3)
            continue
        moves[name] = segment_stretch(heads[first][None, :], *segment)[0] - heads[first]
    return segment, moves


def girth_moves(heads, rows):
    """Gives the moves of the girth factors. The vertices of the trunk bones and of the clavicles
    (`GIRTH`) move away from the trunk axis, the line through the hips joint and the neck joint: the
    part of their distance across the axis along x takes the width factor, and the part in the
    middle plane takes the front factor in front of the axis and the back factor behind it. Each
    row of `rows` gives a share of the axis from the hips joint (0) to the neck joint (1), and the
    width, the front, and the back factor at that share (`girth_profile()`), so that the belly can
    become flatter and the chest deeper while the back on the chair keeps its place. So the trunk keeps its length and the places of its joints along the axis. Each other
    bone moves as a whole by the move of the joint at the start of its chain after the girth
    bones: each arm with its shoulder joint, each leg with its hip joint, and the tail with its
    root. The neck joint lies on the axis, so the neck and the head do not move. So the arms, the
    legs, and the tail keep their sizes and move with the trunk. Gives the function that moves
    points of the girth bones, and the move of each other bone by its name, with no move of the
    root."""
    hips = heads['hips']
    length = np.linalg.norm(heads['neck'] - hips)
    axis = (heads['neck'] - hips) / length
    side = unit(np.array([1.0, 0.0, 0.0]) - axis[0] * axis)

    def widen(points):
        rel = points - hips
        along = rel @ axis
        across = rel - along[:, None] * axis
        wide = (across @ side)[:, None] * side
        width, front, back = girth_profile(rows, along / length)
        flat = across - wide
        # The source faces +z, so a point in front of the axis has a positive z part.
        depth = np.where(flat[:, 2] > 0, front, back)
        return points + (width - 1)[:, None] * wide + (depth - 1)[:, None] * flat

    moves = {}
    for name in BONES:
        if name in GIRTH or PARENTS[name] is None:
            continue
        first = name
        while PARENTS[first] not in GIRTH:
            first = PARENTS[first]
        moves[name] = widen(heads[first][None, :])[0] - heads[first]
    return widen, moves


def girth_row(config):
    """Gives the factors (width, front, back) of the one girth row of `girthFactor` of the config,
    (width, depth), with the depth in front of and behind the trunk axis."""
    width, depth = config.get('girthFactor', [1, 1])
    return [width, depth, depth]


def girth_profile(rows, shares):
    """Gives the width, the front, and the back factors of the girth at shares of the trunk axis,
    from the hips joint (0) to the neck joint (1): a linear blend between the rows (share, width,
    front, back) in the order of their shares, and the factors of the first or the last row beyond
    them. `girthFactor` of the config (width, depth) gives one row with its depth in front and
    behind, and `girthProfile` gives its rows."""
    rows = np.asarray(sorted(rows, key=lambda row: row[0]), float)
    return tuple(np.interp(shares, rows[:, 0], rows[:, k]) for k in (1, 2, 3))


def outward_stretch(points, head, axis, factor, share):
    """Stretches points along a bone from `head` along the unit `axis` by a factor, each point by
    its share of the stretch. A point before the head keeps its place, and a point beyond it moves
    by its place along the bone, as in a linear stretch from the head."""
    along = np.maximum((points - head) @ axis, 0.0) * share
    return points + (factor - 1) * along[:, None] * axis


def arm_girth(points, weights, heads, upper, fore):
    """Moves the points of the upper arms and of the forearms of the source toward their axes by
    the factors of the cross-section `upper` and `fore` (`armGirth` of the config), before the
    skin. The share of each point is its weight on the arm bones of its side: the upper arm, the
    forearm, the twist bone, the arm segments, and the helpers (`segment_bones()`), so the trunk,
    the clavicle, and the paw keep their places. On the upper arm, the factor grows from 0 at the
    shoulder joint to all at `ARM_GIRTH_FADE` of the upper arm, so that the shoulder keeps its
    form. On the forearm, it falls from all at the elbow joint to 0 at the wrist, so that the
    wrist keeps the width of the paw. Across the elbow joint, the factor of the upper arm changes
    to the factor of the forearm over `ARM_GIRTH_ELBOW` of each bone. So the arm keeps its axis,
    its joints, and its bone places, and a rebuilt arm keeps its rings, only thinner."""
    out = points.copy()
    for side in 'LR':
        own = [k for k, name in enumerate(BONES) if name.endswith(f'_{side}')
               and name.startswith(('upper_arm', 'forearm', 'elbow', 'wrist'))]
        share = np.clip(weights[:, own].sum(axis=1), 0.0, 1.0)
        s, e, w = (np.asarray(heads[f'{b}_{side}'], float) for b in ('upper_arm', 'forearm', 'hand'))
        moves = []
        for head, end, factor, is_upper in ((s, e, upper, True), (e, w, fore, False)):
            length = float(np.linalg.norm(end - head))
            axis = (end - head) / length
            rel = points - head
            along = rel @ axis
            across = rel - along[:, None] * axis
            if is_upper:
                fade = smoothstep(along, 0.0, ARM_GIRTH_FADE * length)
                upper_length = length
                elbow = along
            else:
                fade = 1 - smoothstep(along, 0.0, length)
                fore_length = length
            moves.append(((factor - 1) * fade)[:, None] * across)
        blend = smoothstep(elbow, (1 - ARM_GIRTH_ELBOW) * upper_length,
                           upper_length + ARM_GIRTH_ELBOW * fore_length)[:, None]
        out += share[:, None] * ((1 - blend) * moves[0] + blend * moves[1])
    return out


def leg_girth(points, heads, thigh, shin, tail=None):
    """Widens the thighs and the shins of the source across their axes by the factors `thigh` and
    `shin` (`legGirth` of the config), before the skin: each point moves by its place, whatever
    its weights, because the bone heat of a short thick thigh splits its middle between the thigh,
    the shin, and the hips. On the thigh, the share of the factor grows from 0 at `LEG_GIRTH_FADE`
    of the thigh above the hip joint to all at the hip joint, so that the ring at the crotch grows
    and the haunch above it keeps its form, and it falls to 0 over the first `LEG_GIRTH_FADE` of
    the shin. The back of the thigh (-z of the source) keeps its place, so that the seated thigh
    widens up and to the sides and keeps its underside on the seat, and the inner side stops
    `LEG_GIRTH_GAP` from the middle plane. On the shin, the share falls from all at the knee joint to 0 at the ankle joint, so that
    the ankle keeps the width of the foot, and it grows only by the part that the factor of the
    thigh leaves, so that the knee takes the factor of the thigh. Only the points on the side of each leg move. `tail`
    gives the weight of each point on the tail bones (`tail_share()`): a point moves only by the
    rest of its weight, so that a tail that hangs behind the thighs keeps its form. Else the
    stop at the middle plane squeezes the root of a tail that hangs between the legs, such as the
    tail of the cat, to a third of its width."""
    out = points.copy()
    for side, sign in (('L', 1.0), ('R', -1.0)):
        hip, knee, ankle = (np.asarray(heads[f'{b}_{side}'], float)
                            for b in ('thigh', 'shin', 'foot'))
        own = points[:, 0] * sign > 0
        thigh_fade = np.zeros(len(points))
        for head, end, factor, is_thigh in ((hip, knee, thigh, True), (knee, ankle, shin, False)):
            if factor == 1:
                continue
            length = float(np.linalg.norm(end - head))
            axis = (end - head) / length
            rel = points - head
            along = rel @ axis
            across = rel - along[:, None] * axis
            if is_thigh:
                shin_length = float(np.linalg.norm(ankle - knee))
                fade = (smoothstep(along, -LEG_GIRTH_FADE * length, 0.0)
                        * (1 - smoothstep(along, length, length + LEG_GIRTH_FADE * shin_length)))
                across[:, 2] = np.maximum(across[:, 2], 0.0)
                thigh_fade = fade
            else:
                # The shin takes over where the thigh fades out, so that the two factors do not
                # add up to a ridge at the knee.
                fade = (smoothstep(along, -LEG_GIRTH_FADE * length, 0.0)
                        * (1 - smoothstep(along, 0.0, length)) * (1 - thigh_fade))
            out += ((factor - 1) * fade * own)[:, None] * across
        # The inner side stops short of the middle plane, so that the thighs do not cross it.
        out[own, 0] = sign * np.maximum(sign * out[own, 0], np.minimum(sign * points[own, 0],
                                                                        LEG_GIRTH_GAP))
    if tail is not None:
        out = points + (1.0 - tail)[:, None] * (out - points)
    return out


def tail_share(weights):
    """Gives the weight of each vertex on the tail bones: the tail, and the tail tip of a tail of
    two bones."""
    share = weights[:, BONES.index('tail')].copy()
    if TAIL_TIP in BONES:
        share += weights[:, BONES.index(TAIL_TIP)]
    return np.clip(share, 0.0, 1.0)


def segment_stretch(points, head, start, end, factor):
    """Stretches points along a bone from `head` to `end` by a factor, and moves the head to
    `start`. Only the part of a point along the segment stretches: a point before the head moves
    with the head, and a point beyond the end moves with the end, so the parts beyond the joints
    keep their form."""
    axis = end - head
    length = np.linalg.norm(axis)
    y = axis / length
    along = np.clip((points - head) @ y, 0.0, length)
    return points + (start - head) + (factor - 1) * along[:, None] * y


def reach(heads, side):
    """Gives the arm from the shoulder joint over the elbow and the wrist to the middle of the
    palm, as `pnpm studio-body --inspect` measures it."""
    s, e, w, f = (heads[f'{b}_{side}'] for b in ('upper_arm', 'forearm', 'hand', 'fingers'))
    palm = (w + f) / 2
    return np.linalg.norm(e - s) + np.linalg.norm(w - e) + np.linalg.norm(palm - w)


#: The bones that turn with each trunk bone of the shares of `studio.trunk`: the clavicles with
#: the chest, and the ears with the head.
TRUNK_FOLLOWERS = {'clavicle_L': 'chest', 'clavicle_R': 'chest', 'ear_L': 'head', 'ear_R': 'head',
                   JAW: 'head'}


def recline(angle):
    """Gives the turn around the x axis that moves the top of a trunk back by `angle` degrees: the
    up direction goes toward -z, the back of the studio axes."""
    a = np.radians(angle)
    return np.array([[1, 0, 0], [0, np.cos(a), np.sin(a)], [0, -np.sin(a), np.cos(a)]])


def hip_angle(heads):
    """Gives the hip angle from the side, in degrees: the angle between the trunk axis from the
    middle of the hip joints to the neck joint and the thigh axis from the left hip joint to the
    left knee joint."""
    hip = (heads['thigh_L'] + heads['thigh_R']) / 2
    trunk = (heads['neck'] - hip)[[2, 1]]
    thigh = (heads['shin_L'] - heads['thigh_L'])[[2, 1]]
    cos = trunk @ thigh / np.linalg.norm(trunk) / np.linalg.norm(thigh)
    return float(np.degrees(np.arccos(np.clip(cos, -1.0, 1.0))))


def trunk_turn(config, heads, ends, rolls):
    """Finds the recline of the seated bind pose (`studio.trunk`): the turn of the pelvis, in
    degrees, that opens the hip angle (`hip_angle()`) by `open` degrees. A negative `open` closes
    the hip angle, so the trunk leans forward, as for the standing monkey, which brings its center
    of mass over its feet. Each trunk bone takes its share of the turn as its world turn, so that
    the counter turn of the upper trunk keeps the head about level. Gives 0 with no rule."""
    rule = config['studio'].get('trunk')
    if not rule or rule['open'] == 0:
        return 0.0
    upright = hip_angle(posed_heads(heads, bind_turns(config, heads, ends, rolls)))
    low, high = 0.0, 3.0 * rule['open']
    for _ in range(50):
        mid = (low + high) / 2
        turns = bind_turns(config, heads, ends, rolls, mid)
        if (hip_angle(posed_heads(heads, turns)) - upright < rule['open']) == (rule['open'] > 0):
            low = mid
        else:
            high = mid
    return (low + high) / 2


def bind_turns(config, heads, ends, rolls, turn=0.0):
    """Gives the world turn of each bone from the pose of the source to the seated bind pose. The
    legs take the inverse of the turns of the studio from its bind pose to its clip `reference`.
    With a recline (`turn` degrees, `trunk_turn()`), each trunk bone of the shares of
    `studio.trunk` takes its share of it (`recline()`), the clavicles turn with the chest, and the
    ears with the head. Each arm bone turns the least way onto its bind direction after the turn
    of its parent, so that the arm does not twist. With `studio.straightArms`, the forearm and the
    paw keep the turn of the upper arm, so that the elbow and the wrist keep the angles of the
    source (`bind_hinges()`). With `bindSupination`, the paw of a side then turns about its bind
    forearm toward supination by its angle in degrees, and the fingers turn with it
    (`paw_supination()`). The bones of a tail of two bones turn so onto the directions of
    `tailBind`. With a recline, the tip of the tail turns until its end is at the height of the
    upright bind. The other bones do not turn."""
    studio = config['studio']
    turns = {name: np.eye(3) for name in BONES}
    rule = studio.get('trunk')
    if rule and turn:
        for name, share in rule['shares'].items():
            turns[name] = recline(turn * share)
        for name, leader in TRUNK_FOLLOWERS.items():
            if name in turns:
                turns[name] = turns[leader]
    for side in 'LR':
        for bone in LEG:
            q = np.asarray(studio['legTurns'][bone], float)
            if side == 'R':
                q = q * [1, -1, -1, 1]
            turns[f'{bone}_{side}'] = quat_matrix(q).T
        parent = turns[f'clavicle_{side}']
        for bone in ARM:
            name = f'{bone}_{side}'
            if bone in ('forearm_twist', 'fingers'):
                # The twist bone and the fingers keep the turn of their parent.
                turns[name] = parent
                continue
            if bone in STRAIGHT_ARM and studio.get('straightArms', False):
                turns[name] = parent
            else:
                target = np.asarray(studio['bindArms'][bone], float)
                if side == 'R':
                    target = mirrored(target)
                now = parent @ unit(ends[name] - heads[name])
                turns[name] = swing(now, target) @ parent
            if bone == 'hand':
                turns[name] = paw_supination(studio, side, turns, heads) @ turns[name]
            parent = turns[name]
    if TAIL_TIP in BONES:
        # Each tail bone turns the least way onto its bind direction after the turn of its parent.
        parent = np.eye(3)
        targets = (curl_directions(studio['tailCurl'], heads, ends) if 'tailCurl' in studio
                   else studio['tailBind'])
        for name in ('tail', TAIL_TIP):
            now = parent @ unit(ends[name] - heads[name])
            turns[name] = swing(now, np.asarray(targets[name], float)) @ parent
            parent = turns[name]
        if rule and turn:
            # A recline moves the root of the tail down with the pelvis, and the root keeps its
            # direction, so that its underside lies on the seat (`seat_lift()`). The tip turns up
            # or down in its vertical plane until its end is at the height of the end of the tail
            # of the upright bind, so that it hangs behind the chair as with no recline.
            straight = bind_turns(config, heads, ends, rolls)
            tip = ends[TAIL_TIP] - heads[TAIL_TIP]
            end = posed_heads(heads, straight)[TAIL_TIP] + straight[TAIL_TIP] @ tip
            head = posed_heads(heads, turns)[TAIL_TIP]
            now = turns[TAIL_TIP] @ unit(tip)
            rise = float(np.clip((end[1] - head[1]) / np.linalg.norm(tip), -1.0, 1.0))
            flat = unit(np.array([now[0], 0.0, now[2]]))
            target = flat * np.sqrt(1.0 - rise * rise) + np.array([0.0, rise, 0.0])
            turns[TAIL_TIP] = swing(now, target) @ turns[TAIL_TIP]
    if 'armSegments' in config:
        # The arm segments and the helpers turn by the rules of the app.
        turns.update(driven_turns(turns, heads))
    return turns


def paw_supination(studio, side, turns, heads):
    """Gives the turn of the bind paw of one side about its bind forearm, from the elbow to the
    wrist, toward supination by the angle of the side in `bindSupination` (degrees, 0 with no
    value). The forearm of the app turns with its elbow hinge, so the bind paw sets the zero of
    the paw twist (`poseArm()` of `src/models/studio-rig.ts`): this turn moves the zero toward
    supination by the angle, and the forearm segments share it in the bind (`driven_turns()`).
    The studio axes have the left side at +x, so the left paw supinates by a negative turn
    about its forearm, and the right paw by a positive turn."""
    angle = studio.get('bindSupination', {}).get(side, 0)
    if not angle:
        return np.eye(3)
    along = turns[f'forearm_{side}'] @ unit(heads[f'hand_{side}'] - heads[f'forearm_{side}'])
    return axis_turn(along, np.radians(angle) * (-1 if side == 'L' else 1))


def bind_hinges(config, turns, heads, ends):
    """Gives the unit elbow axis of each arm in the bind pose for a config with
    `studio.straightArms`, or `None` with no such rule. The app turns each elbow about this axis
    (`StudioBody.hinges`, `poseArm()` of `src/models/studio-rig.ts`). A straight bind arm has no
    plane of its own, so the axis is the axis of the bent bind of `studio.bindArms`: the bind
    upper arm × the bind forearm direction of the config. Thus the upper arm and the paw take the
    same world turns in each pose as with the bent bind. The forearm differs by the angle of the
    source forearm out of the plane of the bent bind."""
    studio = config['studio']
    if not studio.get('straightArms', False):
        return None
    out = {}
    for side in 'LR':
        name = f'upper_arm_{side}'
        upper = turns[name] @ unit(ends[name] - heads[name])
        fore = np.asarray(studio['bindArms']['forearm'], float)
        if side == 'R':
            fore = mirrored(fore)
        out[side] = unit(np.cross(upper, unit(fore)))
    return out


def posed_heads(heads, turns):
    """Gives the head of each bone after the world turns, from the root down."""
    out = {}
    for name in BONES:
        parent = PARENTS[name]
        if parent is None:
            out[name] = heads[name].copy()
        else:
            out[name] = out[parent] + turns[parent] @ (heads[name] - heads[parent])
    return out


def after_upright(m, u):
    """Gives the (3 × 4) matrix that moves a point of the upright seated bind to the reclined one:
    the matrix `m` from the source after the inverse of the upright matrix `u`."""
    r = m[:, :3] @ u[:, :3].T
    return np.concatenate([r, (m[:, 3] - r @ u[:, 3])[:, None]], axis=1)


def seat_lift(points, tris, weights, chair, rule, top, hip):
    """Lifts the underside of a reclined haunch and of the root of the tail onto the seat top of
    the upright body (`top`): the turn of the pelvis moves the haunch behind the hip joints down
    into the seat. Each vertical line over the seat behind the hip joints takes a lift: the depth
    of its lowest crossing below the seat top. The lift fades to 0 over `ramp` units before the
    hip joints and over `band` units behind the back edge of the seat, the lift of a line with no
    crossing takes the largest lift of its neighbors, and the lifts take the mean of their
    neighbors in `smooth` rounds. Each vertex moves up by the lift at its x and z, fully at the
    underside and less with its height above the lowest crossing, to 0 at `band` units above it,
    so that the haunch flattens on the seat as a seated body does. The rule is `sit` of the
    config. The shins, the feet, and the arms do not move, and a vertex with a part of its weight
    on them moves by the rest. Gives the moved mesh, the number of moved vertices, and the largest
    lift."""
    step, band = rule['step'], rule['band']
    hw, back = chair['halfWidth'], chair['back']
    lower = [BONES.index(f'{b}_{s}') for b in ('shin', 'foot', 'toes') for s in 'LR']
    arms = [BONES.index(n) for s in 'LR' for n in arm_bones(s)]
    fixed = np.clip(weights[:, lower + arms].sum(axis=1), 0.0, 1.0)
    low = points[:, 1] <= top + 2 * band
    body = tris[((fixed[tris] <= 0.5) & low[tris]).all(axis=1)]
    xs = np.arange(-hw, hw + step / 2, step)
    zs = np.arange(back, hip + step / 2, step)
    bottoms = column_bottoms(points, body, xs, zs)
    lift = np.where(np.isfinite(bottoms), np.clip(top - bottoms, 0.0, None), np.nan)
    lift *= 1.0 - smoothstep(zs, hip - rule['ramp'], hip)[None, :]
    lift = np.nan_to_num(fill_holes(lift, np.max), nan=0.0)
    for _ in range(rule['smooth']):
        padded = np.pad(lift, 1, mode='edge')
        lift = sum(padded[1 + di:padded.shape[0] - 1 + di, 1 + dj:padded.shape[1] - 1 + dj]
                   for di in (-1, 0, 1) for dj in (-1, 0, 1)) / 9.0
    floors = fill_holes(np.where(np.isfinite(bottoms), bottoms, np.nan), np.min)
    near = ((np.abs(points[:, 0]) <= hw) & (points[:, 2] <= hip) & (points[:, 2] >= back - band)
            & (points[:, 1] <= top + 2 * band))
    ids = np.nonzero(near & (fixed < 1.0))[0]
    p = points[ids]
    d = grid_value(lift, xs, zs, p) * smoothstep(p[:, 2], back - band, back)
    floor = np.minimum(grid_value(np.nan_to_num(floors, nan=top), xs, zs, p), p[:, 1])
    share = 1.0 - smoothstep(p[:, 1] - floor, 0.0, band)
    move = d * share * (1.0 - fixed[ids])
    out = points.copy()
    out[ids, 1] += move
    return out, int((move > 1e-6).sum()), float(move.max(initial=0.0))


def face_normals(points, tris):
    """Gives the unit normal of each face."""
    n = np.cross(points[tris[:, 1]] - points[tris[:, 0]], points[tris[:, 2]] - points[tris[:, 0]])
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)


def turn_dots(src, posed, tris, weights, matrices):
    """Gives for each face the cosine of its posed normal and its source normal moved by the mean
    skin of its corners (the inverse transpose), as `foldedFaces()` of `tools/fold-probe.ts`.
    Below 0, the face turned over."""
    a = np.zeros((len(src), 3, 3))
    for k, m in enumerate(matrices):
        a += weights[:, k, None, None] * m[:, :3]
    mean = a[tris].mean(axis=1)
    expected = np.einsum('nji,nj->ni', np.linalg.inv(mean), face_normals(src, tris))
    expected /= np.maximum(np.linalg.norm(expected, axis=1, keepdims=True), 1e-12)
    return np.sum(face_normals(posed, tris) * expected, axis=1)


def turned_on(dots, main_bone):
    """Gives the text of the main bones of the faces that turn over (a negative dot), with the
    count of each bone, so that the log shows if a seat or a leg turns faces of the knees over.
    Gives an empty text when no face turns over."""
    counts = {}
    for f in np.nonzero(dots < 0)[0]:
        name = BONES[main_bone[f]]
        counts[name] = counts.get(name, 0) + 1
    if not counts:
        return ''
    return ', on the bones ' + ', '.join(f'{n} {c}' for n, c in sorted(counts.items()))


def default_moving(weights):
    """Gives the vertices that `relax()` moves by default: the vertices that an arm bone, a thigh,
    a shin, or a tail of two bones moves."""
    moving = np.zeros(len(weights), bool)
    for side in 'LR':
        for bone in ('upper_arm', 'forearm', 'forearm_twist', 'thigh', 'shin'):
            moving |= weights[:, BONES.index(f'{bone}_{side}')] > 0
        for name in arm_bones(side)[len(ARM):]:
            moving |= weights[:, BONES.index(name)] > 0
    if TAIL_TIP in BONES:
        moving |= tail_mask(weights)
    return moving


def crease_relax(bind, tris, weights, hip, rule):
    """Smooths the seated bind across the crease where the belly meets the top of each thigh. The
    sloped thighs and the upright trunk fold the mesh there, and the faces of the fold face away
    from the light, so a dark line shows. The seam is each vertex of both a face of the trunk
    (main bone `hips`, `spine`, or `spine1`) and a face of a thigh, in front of the hip joints
    (`z` above `hip[2]` less `back` units) and above the seat (`y` above `hip[1]` less `below`
    units). The region is the seam and `rings` rings of its neighbors. Each vertex of the region
    moves `share` of the way to the middle of its neighbors in each of `rounds` rounds, times a
    weight that falls from 1 on the seam to 0 beyond the last ring, and less its share of the
    weight of the shins, the feet, the arms, and the tail, which keep their places. With `lap`, a
    second smoothing from the same seam, with the `rings`, `rounds`, and `share` of `lap`, reaches
    up the belly front: its weight falls to 0 over `lap.fade` units behind the hip joints and
    beyond `lap.side` units from the middle plane, so that the haunch on the seat and the outer
    hips keep the first smoothing. The corrective shapes give the source back, so the standing
    body keeps its form. Gives the smoothed bind, the number of the seam vertices, the number of
    the moved vertices, and the largest move."""
    main = weights[tris].sum(axis=1).argmax(axis=1)
    trunk = [BONES.index(b) for b in ('hips', 'spine', 'spine1')]
    thighs = [BONES.index(f'thigh_{s}') for s in 'LR']
    on_trunk = np.zeros(len(bind), bool)
    on_thigh = np.zeros(len(bind), bool)
    on_trunk[tris[np.isin(main, trunk)].ravel()] = True
    on_thigh[tris[np.isin(main, thighs)].ravel()] = True
    seam = (on_trunk & on_thigh & (bind[:, 2] > hip[2] - rule['back'])
            & (bind[:, 1] > hip[1] - rule['below']))
    fixed = [BONES.index(f'{b}_{s}') for b in ('shin', 'foot', 'toes') for s in 'LR']
    fixed += [BONES.index(n) for s in 'LR' for n in arm_bones(s)]
    fixed += [BONES.index(b) for b in ('tail', TAIL_TIP) if b in BONES]
    free = 1.0 - np.clip(weights[:, fixed].sum(axis=1), 0.0, 1.0)
    out, moved, largest = seam_relax(bind, tris, seam, free, rule)
    if 'lap' in rule:
        lap = rule['lap']
        fade = lap['fade']
        near = (free * np.clip((bind[:, 2] - hip[2] + fade) / fade, 0.0, 1.0)
                * np.clip((lap['side'] + fade - np.abs(bind[:, 0])) / fade, 0.0, 1.0))
        out = seam_relax(out, tris, seam, near, lap)[0]
        moves = np.linalg.norm(out - bind, axis=1)
        moved, largest = int((moves > 1e-6).sum()), float(moves.max(initial=0.0))
    return out, int(seam.sum()), moved, largest


def knee_relax(bind, tris, weights, heads, rule):
    """Smooths the seated bind across the crease at the back of each knee (`seam_relax()`). The
    bent knee meets the thigh and the shin at a sharp corner, and the faces at the corner turn more
    than the crease angle of the app from each other, so each shows as a light or dark wedge. The
    seam is each vertex of both a face of the thigh and a face of the shin of one side (main
    bone), on the inner side of the knee: its place from the knee joint has a dot of at least
    `inner` units with the unit sum of the directions from the knee to the hip joint and to the
    ankle. A vertex moves by its share of the weight of the thigh and the shin of its side, less
    its share of the hips: on a short leg, the crotch lies near the knee, and a move of its thin
    faces folds them. With `fair`, the calf back of each side is faired after the smoothing
    (`calf_fair()`). Gives the smoothed bind, the number of the seam vertices, the number of
    the moved vertices, the largest move, the number of the faired vertices, and the largest
    move of the fair."""
    main = weights[tris].sum(axis=1).argmax(axis=1)
    hips = BONES.index('hips')
    out, seams, moved, largest = bind, 0, 0, 0.0
    faired, most_fair = 0, 0.0
    for side in 'LR':
        thigh, shin = BONES.index(f'thigh_{side}'), BONES.index(f'shin_{side}')
        on_thigh = np.zeros(len(bind), bool)
        on_shin = np.zeros(len(bind), bool)
        on_thigh[tris[main == thigh].ravel()] = True
        on_shin[tris[main == shin].ravel()] = True
        knee = heads[f'shin_{side}']
        inner = unit(unit(heads[f'thigh_{side}'] - knee) + unit(heads[f'foot_{side}'] - knee))
        seam = on_thigh & on_shin & ((out - knee) @ inner >= rule['inner'])
        free = np.clip(weights[:, thigh] + weights[:, shin] - weights[:, hips], 0.0, 1.0)
        out, count, most = seam_relax(out, tris, seam, free, rule)
        seams, moved, largest = seams + int(seam.sum()), moved + count, max(largest, most)
        if 'fair' in rule:
            shin_axis = unit(heads[f'foot_{side}'] - knee)
            thigh_axis = unit(heads[f'thigh_{side}'] - knee)
            back = unit(thigh_axis - (thigh_axis @ shin_axis) * shin_axis)
            out, count, most = calf_fair(bind, out, tris, knee, shin_axis, back, free,
                                         rule['fair'])
            faired, most_fair = faired + count, max(most_fair, most)
    return out, seams, moved, largest, faired, most_fair


def calf_fair(bind, out, tris, knee, shin_axis, back, free, rule):
    """Fairs the calf back of one side along the vertex normals after the smoothing of the knee
    crease (design 4.4). The smoothing slides the calf vertices along the skin toward the knee,
    and the rings of the calf cut the long thin source faces there into slivers, so a long valley
    with a dark facet stayed on the calf. Each vertex of the back of the calf (its place across
    the shin axis points to the side of `back`, the direction to the hip joint across the shin)
    whose place in `bind` lies from `from` to `to` units down the shin from the knee joint, and
    within `radius` units of the axis of the shin, moves `share` of the normal part of the way to the middle of its neighbors
    in each of `rounds` rounds, times its `free` share and a half sine that is 1 in the middle of
    the band and 0 at its ends. Thus the valley fills, no vertex slides along the skin, and the
    shin front, the paw, and the inner thigh near the crotch keep their places. Gives the faired
    bind, the number of the faired vertices, and the largest move."""
    along = (bind - knee) @ shin_axis
    side = (bind - knee) - np.outer(along, shin_axis)
    across = np.linalg.norm(side, axis=1)
    ids = np.nonzero((along > rule['from']) & (along < rule['to']) & (across < rule['radius'])
                     & (side @ back > 0) & (free > 0))[0]
    weight = rule['share'] * free[ids] * np.sin(
        np.pi * (along[ids] - rule['from']) / (rule['to'] - rule['from']))
    neighbors = [set() for _ in range(len(out))]
    for a, b, c in tris:
        neighbors[a].update((b, c))
        neighbors[b].update((a, c))
        neighbors[c].update((a, b))
    rings = [np.array(sorted(neighbors[i])) for i in ids]
    start = out
    out = out.copy()
    for _ in range(rule['rounds']):
        corners = out[tris]
        areas = np.cross(corners[:, 1] - corners[:, 0], corners[:, 2] - corners[:, 0])
        normals = np.zeros_like(out)
        for k in range(3):
            np.add.at(normals, tris[:, k], areas)
        normals = normals[ids] / np.maximum(np.linalg.norm(normals[ids], axis=1, keepdims=True),
                                            1e-12)
        mids = np.array([out[r].mean(axis=0) for r in rings])
        out[ids] += weight[:, None] * ((mids - out[ids]) * normals).sum(axis=1)[:, None] * normals
    moves = np.linalg.norm(out - start, axis=1)
    return out, len(ids), float(moves.max(initial=0.0))


def seam_relax(bind, tris, seam, free, rule):
    """Smooths the bind around a seam. Each vertex of the region moves `share` of the way to the
    middle of its neighbors in each of `rounds` rounds, times a weight and times its `free` share
    (0 keeps its place). The region is the vertices of `seam` and `rings` rings of their
    neighbors, and the weight falls from 1 on the seam to 0 beyond the last ring. With `reach`,
    the region is each vertex within `reach` units of a seam vertex in the bind, and the weight
    falls with that distance from 1 on the seam to 0 at `reach` (a half cosine), so that the far
    corner of a long face keeps its place. Gives the smoothed bind, the number of the moved
    vertices, and the largest move."""
    neighbors = [set() for _ in range(len(bind))]
    for a, b, c in tris:
        neighbors[a].update((b, c))
        neighbors[b].update((a, c))
        neighbors[c].update((a, b))
    if 'reach' in rule:
        points = bind[seam]
        near = np.array([np.linalg.norm(points - p, axis=1).min() for p in bind])
        ids = np.nonzero((near < rule['reach']) & (free > 0))[0]
        fall = 0.5 * (1.0 + np.cos(np.pi * near[ids] / rule['reach']))
    else:
        ring = np.full(len(bind), -1)
        ring[seam] = 0
        front = list(np.nonzero(seam)[0])
        for k in range(1, rule['rings'] + 1):
            grown = []
            for i in front:
                for j in neighbors[i]:
                    if ring[j] < 0:
                        ring[j] = k
                        grown.append(j)
            front = grown
        ids = np.nonzero(ring >= 0)[0]
        fall = 1.0 - ring[ids] / (rule['rings'] + 1.0)
    w = fall * free[ids] * rule['share']
    rings = [np.array(sorted(neighbors[i])) for i in ids]
    out = bind.copy()
    for _ in range(rule['rounds']):
        mids = np.array([out[r].mean(axis=0) for r in rings])
        out[ids] += w[:, None] * (mids - out[ids])
    moves = np.linalg.norm(out - bind, axis=1)
    return out, int((moves > 1e-6).sum()), float(moves.max(initial=0.0))


def haunch_mask(weights):
    """Gives the vertices that the hips or the tail move: the haunch, which a recline turns into
    the seat (`seat_lift()`), and the root of the tail."""
    bones = [BONES.index(b) for b in ('hips', 'tail', TAIL_TIP) if b in BONES]
    return weights[:, bones].sum(axis=1) > 0


def seat_top(points, weights, chair):
    """Gives the seat top of a seated body: the lowest point over the seat with no hanging shin,
    foot, or tail, as `chair_mesh()` puts the seat."""
    seat, hanging, tail, _ = seat_masks(points, weights, chair)
    return float(points[seat & ~hanging & ~tail, 1].min())


def relax(src, bind, tris, weights, matrices, rounds=60, moving=None, below=0.1):
    """Cleans the bind mesh where the bind pose pinches it: each vertex of a face that turns over
    (or nearly: the cosine of `turn_dots()` below `below`) against the source moves halfway to the
    middle of its neighbors, in rounds, until no face turns over. Only the vertices of `moving` can
    move: by default the vertices that an arm bone, a thigh, a shin, or a tail of two bones moves,
    so that the paws and the feet keep their form. The corrective shapes give the source back.
    Gives the cleaned bind mesh and the number of rounds."""
    if moving is None:
        moving = default_moving(weights)
    neighbors = [set() for _ in range(len(src))]
    for a, b, c in tris:
        neighbors[a].update((b, c))
        neighbors[b].update((a, c))
        neighbors[c].update((a, b))
    neighbors = [np.array(sorted(n)) for n in neighbors]
    out = bind.copy()
    for done in range(rounds):
        bad = np.nonzero(turn_dots(src, out, tris, weights, matrices) < below)[0]
        ids = np.unique(tris[bad])
        ids = ids[moving[ids]]
        if len(ids) == 0:
            return out, done
        mids = np.array([out[neighbors[i]].mean(axis=0) for i in ids])
        out[ids] = 0.5 * out[ids] + 0.5 * mids
    return out, rounds


def smooth_box(verts, tris, rule):
    """Smooths the vertices inside a box of the source: each vertex inside moves `share` of the way
    to the middle of its neighbors, in `rounds` rounds, and the vertices outside keep their places.
    The fur spikes of the head of the fox mesh hang over the back of its neck, and the larger head
    makes them a dark jagged band under the head. Gives the smoothed vertices, the number of the
    vertices inside, and the largest move."""
    low, high = np.asarray(rule['box'][0], float), np.asarray(rule['box'][1], float)
    inside = np.all((verts >= low) & (verts <= high), axis=1)
    neighbors = [set() for _ in range(len(verts))]
    for a, b, c in tris:
        neighbors[a].update((b, c))
        neighbors[b].update((a, c))
        neighbors[c].update((a, b))
    ids = np.nonzero(inside)[0]
    rings = [np.array(sorted(neighbors[i])) for i in ids]
    out = verts.copy()
    for _ in range(rule['rounds']):
        mids = np.array([out[r].mean(axis=0) for r in rings])
        out[ids] = (1.0 - rule['share']) * out[ids] + rule['share'] * mids
    moves = np.linalg.norm(out - verts, axis=1)
    return out, len(ids), float(moves.max(initial=0.0))


def head_shift(before, after, weights, tris, materials):
    """Gives the move that takes the head center of the holds back to the head before the
    smoothing (`smooth_box()`): the middle of the box of the head before the smoothing less the
    middle after it. `pnpm studio-body` measures the head center of the holds as the middle of the
    box of the fur vertices with more than half of their weight on the head. The fur spikes at the
    back of the head of the fox mesh set the back of that box, so the smoothing moves the center
    forward, and with it the violin, which the holds place from the head center. With the move,
    the holds keep their places."""
    fur = np.unique(tris[materials == 'fur'])
    fur = fur[fur < len(before)]
    ids = fur[weights[fur, BONES.index('head')] > 0.5]

    def middle(points):
        return 0.5 * (points[ids].min(axis=0) + points[ids].max(axis=0))

    return middle(before) - middle(after)


def seat_masks(points, weights, chair, root=None):
    """Gives the masks of the seat of a seated body, as `chair_mesh()` reads them: the vertices
    over the seat, the vertices of the shins and the feet that hang in front of it, and the
    vertices of the tail. Gives also the share of each vertex on these hanging bones and on the
    tail and arm bones. With `root` (two shares of the tail), the tail share of a vertex counts
    only by its smoothstep over these shares, so that the vertices of the root of the tail, which
    share their weight with the hips, count as the haunch."""
    hw, front, back = chair['halfWidth'], chair['front'], chair['back']
    lower = [BONES.index(f'{b}_{s}') for b in ('shin', 'foot', 'toes') for s in 'LR']
    tails = [BONES.index(b) for b in ('tail', TAIL_TIP) if b in BONES]
    arms = [BONES.index(n) for s in 'LR' for n in arm_bones(s)]
    hanging = weights[:, lower].sum(axis=1)
    tail = weights[:, tails].sum(axis=1)
    if root:
        tail = smoothstep(tail, *root)
    free = hanging + tail + weights[:, arms].sum(axis=1)
    seat = (np.abs(points[:, 0]) <= hw) & (points[:, 2] >= back) & (points[:, 2] <= front)
    return seat, hanging > 0.5, tail > 0.5, np.clip(free, 0.0, 1.0)


def haunch_gap(points, weights, chair, rule, hips):
    """Measures the haunch of a seated body before the sit. A vertex is of the haunch when the
    hips carry more than half of its weight. With `root` of the sit rule (two shares of the
    tail), the tail share of a vertex counts for the haunch by 1 less its smoothstep over these
    shares, as the sit counts the root of the tail (`seat_masks()`). Gives the seat top
    (`seat_top()`), the lowest point of the haunch behind the hips joint (z at most `hips`) over
    the seat, and the front edge of the chair that puts no point of the seat below that point:
    the z of the first point below it from the back edge, rounded back to a step of
    `FRONT_STEP`. The front edge is None when no point lies below. The thighs of a short leg can
    set the seat top far below the round haunch, and the sit then pulls the haunch down into a
    sheet behind the seat."""
    seat, hanging, tail, _ = seat_masks(points, weights, chair)
    top = float(points[seat & ~hanging & ~tail, 1].min())
    tails = [BONES.index(b) for b in ('tail', TAIL_TIP) if b in BONES]
    share = weights[:, tails].sum(axis=1)
    haunch = weights[:, BONES.index('hips')]
    if rule.get('root'):
        haunch = haunch + share * (1.0 - smoothstep(share, *rule['root']))
    over = ((np.abs(points[:, 0]) <= chair['halfWidth']) & (points[:, 2] >= chair['back'])
            & ~hanging)
    low = float(points[over & (haunch > 0.5) & (points[:, 2] <= hips), 1].min())
    below = over & ~tail & (points[:, 1] < low)
    if not below.any():
        return top, low, None
    first = float(points[below, 2].min())
    return top, low, round(math.floor((first - 1e-9) / FRONT_STEP) * FRONT_STEP, 6)


def column_bottoms(points, tris, xs, zs):
    """Gives the lowest crossing of the faces with each vertical line of a grid: one line for each
    x of `xs` and each z of `zs`. A line that crosses no face gives infinity."""
    gx, gz = np.meshgrid(xs, zs, indexing='ij')
    q = np.stack([gx.ravel(), gz.ravel()], axis=1)
    out = np.full(len(q), np.inf)
    p = points[tris]
    a, b, c = p[:, 0][:, [0, 2]], p[:, 1][:, [0, 2]], p[:, 2][:, [0, 2]]
    v0, v1 = b - a, c - a
    den = v0[:, 0] * v1[:, 1] - v0[:, 1] * v1[:, 0]
    low = np.minimum(np.minimum(a, b), c)
    high = np.maximum(np.maximum(a, b), c)
    near = ((np.abs(den) > 1e-12) & (high[:, 0] >= xs[0]) & (low[:, 0] <= xs[-1])
            & (high[:, 1] >= zs[0]) & (low[:, 1] <= zs[-1]))
    for k in np.nonzero(near)[0]:
        box = ((q[:, 0] >= low[k, 0]) & (q[:, 0] <= high[k, 0]) & (q[:, 1] >= low[k, 1])
               & (q[:, 1] <= high[k, 1]))
        ids = np.nonzero(box)[0]
        if len(ids) == 0:
            continue
        r = q[ids] - a[k]
        u = (r[:, 0] * v1[k, 1] - r[:, 1] * v1[k, 0]) / den[k]
        v = (v0[k, 0] * r[:, 1] - v0[k, 1] * r[:, 0]) / den[k]
        inside = (u >= -1e-9) & (v >= -1e-9) & (u + v <= 1 + 1e-9)
        y = p[k, 0, 1] + u * (p[k, 1, 1] - p[k, 0, 1]) + v * (p[k, 2, 1] - p[k, 0, 1])
        hit = ids[inside]
        out[hit] = np.minimum(out[hit], y[inside])
    return out.reshape(gx.shape)


def grid_value(grid, xs, zs, points):
    """Reads a grid at the x and the z of each point, with a bilinear blend of the four nearest
    lines. A point outside the grid takes the nearest line at the edge."""
    fx = np.clip((points[:, 0] - xs[0]) / (xs[1] - xs[0]), 0, len(xs) - 1.000001)
    fz = np.clip((points[:, 2] - zs[0]) / (zs[1] - zs[0]), 0, len(zs) - 1.000001)
    i, j = fx.astype(int), fz.astype(int)
    tx, tz = fx - i, fz - j
    return ((1 - tx) * (1 - tz) * grid[i, j] + tx * (1 - tz) * grid[i + 1, j]
            + (1 - tx) * tz * grid[i, j + 1] + tx * tz * grid[i + 1, j + 1])


def fill_holes(grid, pick):
    """Fills the holes (NaN) of a grid with the value that `pick` (`np.max` or `np.min`) takes of
    the values of the eight neighbors, in rounds, until no hole has a neighbor with a value."""
    out = grid.copy()
    while True:
        holes = np.isnan(out)
        padded = np.pad(out, 1, constant_values=np.nan)
        around = np.stack([padded[1 + di:padded.shape[0] - 1 + di, 1 + dj:padded.shape[1] - 1 + dj]
                           for di in (-1, 0, 1) for dj in (-1, 0, 1)])
        known = ~np.isnan(around)
        fill = holes & known.any(axis=0)
        if not fill.any():
            return out
        empty = np.inf if pick is np.min else -np.inf
        out[fill] = pick(np.where(known, around, empty), axis=0)[fill]


def seat_gaps(points, tris, weights, chair, hip, step, height, root=None):
    """Measures the underside of a seated body behind the hip joints: the lowest crossing of each
    vertical line over the seat, on a grid of `step` units, less the seat top. The faces of the
    shins, the feet, the tail, and the arms do not count, and neither do the faces with a corner
    more than `height` units above the seat top. `root` goes to `seat_masks()`. Gives the seat
    top, the x and the z of the lines, and the gap of each line (infinity where no face crosses
    it)."""
    seat, hanging, tail, _ = seat_masks(points, weights, chair)
    top = float(points[seat & ~hanging & ~tail, 1].min())
    _, _, _, free = seat_masks(points, weights, chair, root)
    low = points[:, 1] <= top + height
    body = tris[((free[tris] <= 0.5) & low[tris]).all(axis=1)]
    hw = chair['halfWidth']
    xs = np.arange(-hw, hw + step / 2, step)
    zs = np.arange(chair['back'], hip + step / 2, step)
    return top, xs, zs, column_bottoms(points, body, xs, zs) - top


def silhouette_gap(xs, zs, gaps, end):
    """Gives the largest gap of the side view of the underside behind the hip joints: for each z,
    the smallest gap over x. The last `end` units of the haunch at its back do not count, because
    each round haunch curves up there."""
    side = np.where(np.isfinite(gaps), gaps, np.inf).min(axis=0)
    hit = np.nonzero(np.isfinite(side))[0]
    if len(hit) == 0:
        return 0.0
    keep = zs >= zs[hit[0]] + end
    return float(side[keep & np.isfinite(side)].max(initial=0.0))


def sit(bind, tris, weights, chair, rule, hip):
    """Lowers the underside of the haunch behind the hip joints onto the seat. The buttocks of an
    image mesh curve up behind the hip joints, so they stay above the seat when the thighs lie
    level on it. Each vertical line over the seat behind the hip joints takes a drop: the gap of
    its lowest crossing over the seat top, less `gap` of the rule, and at most `most` units, so that
    the round back of the haunch near a tail ball keeps its form. The drop fades to 0 over `ramp`
    units before the hip joints, and over the last `end` units of the haunch at its back. The drop
    of a line with no crossing takes the largest drop of its
    neighbors, and the drops take the mean of their neighbors in `smooth` rounds. Each vertex over
    the seat moves down by the drop at its x and z, fully at the underside and less with its height
    above the lowest crossing, to 0 at `band` units above it. Only the faces and the vertices up
    to two bands above the seat top count, so that the ears and the head do not. The shins, the feet, the tail, and the
    arms do not move, and a vertex with a part of its weight on them moves by the rest. The vertices
    never go below the seat top. With `root` (two shares of the tail), the vertices of the root of
    the tail, which share their weight with the hips, move and count as the haunch
    (`seat_masks()`). With `top` (units), the drop goes to that seat top in place of the lowest
    point over the seat, so that a change of the tail does not move the seat. With `carryTail`,
    the tail moves down with the mean drop of its root: the vertices that share their weight with
    the tail, or the ring of the haunch around a tail ball. With `tailSpread`, the haunch near the
    tail moves with it (`tail_spread()`). The corrective shapes give the source
    back, so the standing body keeps its form. Gives the moved bind mesh, the number of moved
    vertices, the largest drop, and the largest gap of the side view before and after."""
    step = rule['step']
    root = rule.get('root')
    top, xs, zs, gaps = seat_gaps(bind, tris, weights, chair, hip, step, 2 * rule['band'], root)
    if 'top' in rule:
        gaps = gaps + top - rule['top']
        top = rule['top']
    before = silhouette_gap(xs, zs, gaps, rule['end'])
    drop = np.where(np.isfinite(gaps), np.clip(gaps - rule['gap'], 0.0, rule['most']), np.nan)
    drop *= 1.0 - smoothstep(zs, hip - rule['ramp'], hip)[None, :]
    hit = np.nonzero(np.isfinite(gaps).any(axis=0))[0]
    if len(hit):
        drop *= smoothstep(zs, zs[hit[0]], zs[hit[0]] + rule['end'])[None, :]
    drop = np.nan_to_num(fill_holes(drop, np.max), nan=0.0)
    for _ in range(rule['smooth']):
        padded = np.pad(drop, 1, mode='edge')
        drop = sum(padded[1 + di:padded.shape[0] - 1 + di, 1 + dj:padded.shape[1] - 1 + dj]
                   for di in (-1, 0, 1) for dj in (-1, 0, 1)) / 9.0
    # A line with no crossing, as beyond the back edge of the haunch, takes the lowest crossing of
    # its nearest lines.
    bottoms = fill_holes(np.where(np.isfinite(gaps), gaps + top, np.nan), np.min)
    _, _, _, free = seat_masks(bind, weights, chair, root)
    near = ((np.abs(bind[:, 0]) <= chair['halfWidth']) & (bind[:, 2] <= hip)
            & (bind[:, 2] >= chair['back'] - rule['band']) & (bind[:, 1] <= top + 2 * rule['band']))
    ids = np.nonzero(near & (free < 1.0))[0]
    p = bind[ids]
    d = grid_value(drop, xs, zs, p)
    floor = np.minimum(grid_value(np.nan_to_num(bottoms, nan=top), xs, zs, p), p[:, 1])
    share = 1.0 - smoothstep(p[:, 1] - floor, 0.0, rule['band'])
    move = d * share * (1.0 - free[ids])
    out = bind.copy()
    out[ids, 1] = np.maximum(p[:, 1] - move, np.minimum(p[:, 1], top))
    if rule.get('carryTail'):
        # The root of the tail moves with the haunch, and the rest of the tail does not, so a
        # large drop squeezes the tail into a flat wedge, or stretches the faces under a tail
        # ball into a column. Each vertex of the tail also moves down by the mean drop of the
        # moved vertices of the root, by its share on the tail bones.
        tails = [BONES.index(b) for b in ('tail', TAIL_TIP) if b in BONES]
        raw = weights[:, tails].sum(axis=1)
        ring = (raw[ids] > 0.0) & (move > 1e-6)
        part = raw[ids]
        if not ring.any():
            # A tail ball (`tailBall`) follows the tail only, so no vertex of its root shares
            # its weight with the hips. Its root is then the ring of the haunch around it: the
            # vertices of the faces that join the ball to the haunch, each with the same part.
            tail = raw > 0.0
            joins = tail[tris].any(axis=1) & ~tail[tris].all(axis=1)
            joined = np.zeros(len(bind), bool)
            joined[tris[joins].ravel()] = True
            ring = joined[ids] & ~tail[ids] & (move > 1e-6)
            part = np.ones(len(ids))
        if ring.any():
            carry = float(np.average(move[ring], weights=part[ring]))
            moved = out[:, 1] - bind[:, 1]
            carried = -carry * raw
            out[:, 1] = bind[:, 1] + np.where(raw > 0.0, np.minimum(moved, carried), moved)
            log(f'sit: the tail moves down with the mean drop {carry:.4f} u of its root')
            if 'tailSpread' in rule:
                out = tail_spread(bind, out, raw > 0.0, carry, rule['tailSpread'], top)
    _, _, _, after_gaps = seat_gaps(out, tris, weights, chair, hip, step, 2 * rule['band'], root)
    after = silhouette_gap(xs, zs, after_gaps, rule['end'])
    return out, int((move > 1e-6).sum()), float(move.max(initial=0.0)), before, after


def tail_spread(bind, out, tail, carry, spread, top):
    """Moves the haunch near a carried tail with the tail (`tailSpread` of the sit rule, two
    distances in units). The drop of the sit is largest at the underside and falls with the
    height, so the ring of the haunch around a tail ball drops by different amounts, and a ball
    that moves as a whole stretches the faces above or below it into a point. A vertex within the
    first distance of the tail moves down by the drop of the tail, and the share of that drop falls
    to 0 at the second distance, so that the change of the drop spreads over several faces. A
    vertex below the lowest point of the tail only moves further down, so that the seat top keeps
    its place, and no vertex goes below the seat top `top`. Gives the moved bind mesh."""
    inner, outer = spread
    gaps = np.linalg.norm(bind[:, None, :] - bind[tail][None, :, :], axis=2).min(axis=1)
    near = ~tail & (gaps < outer)
    share = 1.0 - smoothstep(gaps[near], inner, outer)
    drop = out[near, 1] - bind[near, 1]
    blend = (1.0 - share) * drop - share * carry
    low = bind[near, 1] < bind[tail, 1].min()
    moved = bind[near, 1] + np.where(low, np.minimum(drop, blend), blend)
    out = out.copy()
    out[near, 1] = np.maximum(moved, np.minimum(bind[near, 1], top))
    log(f'sit: {int(near.sum())} vertices of the haunch within {outer} u of the tail move with it')
    return out


def sit_pose(config, weights, points, tris, heads, ends, rolls, meters):
    """Makes the sit pose of a body that binds standing (`sitPose` of the config, design 4.4), with
    the steps of the seated bind of a seated body. The legs take the turns of `legTurns`: the
    world turn of each left leg bone from the sit pose to the source, as `studio.legTurns`. The
    faces that the turn folds relax toward the source. The underside of the haunch goes down onto
    the seat of `chair` with the rule `sit` (`sit()`). The crease of the belly and the thighs
    relaxes with the rule `crease` (`crease_relax()`), and the crease of each knee with the rule
    `kneeCrease` (`knee_relax()`). With `bind`, the skin of the sit pose takes that blend in place
    of the `bind` of the config (`bind_skin()`). The trunk, the arms, and the tail keep the bind
    of the config. Gives the sit mesh, the world turn of each bone from the source to the sit
    pose, and the head of each bone in the sit pose."""
    rule = config['sitPose']
    seat = dict(config, studio=dict(config['studio'], legTurns=rule['legTurns']),
                bind=rule.get('bind', config.get('bind', {})))
    turns = bind_turns(seat, heads, ends, rolls)
    posed = posed_heads(heads, turns)
    matrices = [move(turns[n], heads[n], posed[n]) for n in BONES]
    main_bone = weights[tris].sum(axis=1).argmax(axis=1)
    mesh = bind_skin(seat, weights, matrices, points)
    mesh, rounds = relax(points, mesh, tris, weights, matrices)
    dots = turn_dots(points, mesh, tris, weights, matrices)
    log(f'sit pose: after {rounds} rounds of relaxing, {int((dots < 0).sum())} faces turn over'
        f'{turned_on(dots, main_bone)}')
    chair = rule['chair']
    hip = float(posed['thigh_L'][2])
    top, low, _ = haunch_gap(mesh, weights, chair, rule.get('sit', {}), float(posed['hips'][2]))
    gap = (low - top) * meters
    log(f'sit pose: before the sit, the lowest point of the haunch behind the hips joint is '
        f'{abs(gap) * 100:.2f} cm {"above" if gap >= 0 else "below"} the seat top {top:.4f} u')
    if 'sit' in rule:
        mesh, moved, largest, before, after = sit(mesh, tris, weights, chair, rule['sit'], hip)
        log(f'sit pose: {moved} vertices of the haunch move down, at most {largest:.4f} u '
            f'({largest * meters * 100:.2f} cm). The side view of the underside behind the hip '
            f'joints is at most {before * meters * 100:.2f} cm above the seat before and '
            f'{after * meters * 100:.2f} cm after')
    if rule.get('crease', {}).get('rounds', 0) > 0:
        mesh, seam, moved, largest = crease_relax(mesh, tris, weights, posed['thigh_L'],
                                                  rule['crease'])
        log(f'sit pose: crease of {seam} seam vertices, {moved} vertices move, at most '
            f'{largest:.4f} u ({largest * meters * 100:.2f} cm)')
    if rule.get('kneeCrease', {}).get('rounds', 0) > 0:
        mesh, seam, moved, largest, _, _ = knee_relax(mesh, tris, weights, posed,
                                                      rule['kneeCrease'])
        log(f'sit pose: knee crease of {seam} seam vertices, {moved} vertices move, at most '
            f'{largest:.4f} u ({largest * meters * 100:.2f} cm)')
    dots = turn_dots(points, mesh, tris, weights, matrices)
    log(f'sit pose: {int((dots < 0).sum())} faces turn over in the sit mesh'
        f'{turned_on(dots, main_bone)}')
    return mesh, turns, posed


def sit_shapes(sit_mesh, sit_turns, sit_heads, bind, weights, turns, heads, upper_share=None):
    """Finds the sit shapes of a body that binds standing (`sitPose` of the config): the move of
    each vertex in the bind pose that the skin of the clip `sit` takes to its place in the sit
    mesh (`sit_pose()`), as `correctives()` finds the shapes of the clip `reference`. The vertices
    after the sit mesh, such as the eye shells, take the skin of the clip. Each move splits into
    `sit_L` and `sit_R` with a smooth ramp across the middle plane, as `split_shapes()` splits the
    leg shapes. Gives the shapes, the world turn of each bone from the bind pose to the sit pose,
    the matrices of the clip, and the largest error of the clip with the shapes."""
    rel = {n: np.eye(3) if np.array_equal(sit_turns[n], turns[n]) else sit_turns[n] @ turns[n].T
           for n in BONES}
    matrices = [move(rel[n], heads[n], sit_heads[n]) for n in BONES]
    if upper_share is not None:
        matrices += twist_matrices(rel, heads, sit_heads, upper_share)
    target = skin(weights, matrices, bind)
    target[:len(sit_mesh)] = sit_mesh
    moves, det, worst = correctives(target, bind, weights, rel, sit_heads, heads, upper_share)
    log(f'sit shapes: the smallest determinant of the skin is {det:.4f} at the vertex {worst}')
    error = float(np.linalg.norm(skin(weights, matrices, bind + moves) - target, axis=1).max())
    side = smoothstep(bind[:, 0], -0.02, 0.02)
    shapes = {'sit_L': moves * side[:, None], 'sit_R': moves * (1 - side)[:, None]}
    return shapes, rel, target, error


def boundary_loop(tris):
    """Gives the longest closed loop of the open edges of a patch of faces, in the order of the
    faces (counterclockwise from outside for faces in that order). Two parts of a patch can touch
    at one corner, with two open edges out of it, as the left eye of the fox does. The loop then
    goes around both parts and passes that corner two times: each loop is a walk that uses each
    open edge of its part one time (the algorithm of Hierholzer)."""
    count = {}
    for t in tris:
        for k in range(3):
            edge = (int(t[k]), int(t[(k + 1) % 3]))
            count[edge] = count.get(edge, 0) + 1
    outs = {}
    for a, b in sorted(count):
        if (b, a) not in count:
            outs.setdefault(a, []).append(b)
    loops, used = [], set()
    for start in sorted(outs):
        if all((start, b) in used for b in outs[start]):
            continue
        stack, walk = [start], []
        while stack:
            v = stack[-1]
            free = [b for b in outs.get(v, []) if (v, b) not in used]
            if free:
                used.add((v, free[0]))
                stack.append(free[0])
            else:
                walk.append(stack.pop())
        walk.reverse()
        if len(walk) > 1 and walk[0] == walk[-1]:
            loops.append(walk[:-1])
    return max(loops, key=len) if loops else []


def fan_gap(points, fan, inside, normal):
    """Gives the largest height of a point above a fan of triangles, along a normal: the lift
    that puts each point under the fan. A point counts for the triangle that holds it when both
    are seen along the normal."""
    gap = 0.0
    for a, b, c in fan:
        pa, pb, pc = points[a], points[b], points[c]
        face = np.cross(pb - pa, pc - pa)
        if abs(face.dot(normal)) < 1e-12:
            continue
        for p in inside:
            # The point where the line through p along the normal meets the plane of the face.
            t = (pa - p).dot(face) / normal.dot(face)
            q = p + t * normal
            u = np.cross(pb - pa, q - pa).dot(face)
            v = np.cross(pc - pb, q - pb).dot(face)
            w = np.cross(pa - pc, q - pc).dot(face)
            if (u >= 0 and v >= 0 and w >= 0) or (u <= 0 and v <= 0 and w <= 0):
                gap = max(gap, -t)
    return gap


def old_eye_faces(points, tris, faces, loop, normal, rule):
    """Finds the faces of the old eye of one side: the dark faces of the eye, and each face whose
    middle lies within `reach` times the radius of the edge of the dark faces from the middle of
    the edge, seen along the normal of the eye, such as the white of the almond eye of the fox and
    the brown lid shading under its right eye. A face counts only within half the radius from the
    plane of the edge, so that the back of the head does not count."""
    ring = points[loop]
    center = ring.mean(axis=0)
    radius = np.linalg.norm(np.cross(ring - center, normal), axis=1).max()
    mids = points[tris].mean(axis=1) - center
    across = np.linalg.norm(np.cross(mids, normal), axis=1)
    near = (across <= rule['reach'] * radius) & (np.abs(mids @ normal) <= 0.5 * radius)
    return np.union1d(faces, np.nonzero(near)[0])


def dark_faces_near(points, tris, dark, taken, loop, normal, rule):
    """Finds the dark faces near the old eye of one side that no old eye holds, such as the end of
    the black upper lid line of the almond eye of the fox above its inner corner: each dark face
    (`face_colors()`) whose middle lies within `darkReach` times the radius of the edge of the
    dark faces of the eye from the middle of the edge, seen along the normal of the eye, and within
    half that radius of the plane of the edge. The faces in `taken` do not count. Gives the faces
    in patches: the faces of a patch share corners, and the faces of two patches share none."""
    ring = points[loop]
    center = ring.mean(axis=0)
    radius = np.linalg.norm(np.cross(ring - center, normal), axis=1).max()
    mids = points[tris].mean(axis=1) - center
    across = np.linalg.norm(np.cross(mids, normal), axis=1)
    near = (dark & (across <= rule['darkReach'] * radius)
            & (np.abs(mids @ normal) <= 0.5 * radius))
    near[np.asarray(list(taken), int)] = False
    return corner_patches(tris, np.nonzero(near)[0])


def corner_patches(tris, faces):
    """Splits faces into patches: the faces of a patch share corners, and the faces of two patches
    share none. Gives the faces of each patch, in the order in which its last face comes."""
    patches = []
    for f in faces:
        corners = set(int(c) for c in tris[f])
        joined = [p for p in patches if corners & p[1]]
        members = [int(f)] + [g for p in joined for g in p[0]]
        corners |= set(c for p in joined for c in p[1])
        patches = [p for p in patches if p not in joined] + [(members, corners)]
    return [np.array(sorted(members)) for members, _ in patches]


def recolor_old_eyes(colors, tris, points, old):
    """Gives each face of an old eye, or of a patch of dark faces near it (`dark_faces_near()`),
    the color of the fur around it, so that no outline of the old eye shows around the pea eye of
    the app (design 4.5): the color with the largest area in the ring of faces that share a corner
    with the faces. A single color keeps the lid shading of the ring, such as the brown faces above
    the right eye of the fox, out of the old eye. Gives the new colors and the share of the area of
    the ring that has the color."""
    inside = set(int(f) for f in old)
    corners = set(int(c) for f in old for c in tris[f])
    ring = [f for f, t in enumerate(tris)
            if f not in inside and any(int(c) in corners for c in t)]
    a, b, c = points[tris[ring, 0]], points[tris[ring, 1]], points[tris[ring, 2]]
    areas = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
    totals = {}
    for f, area in zip(ring, areas):
        key = tuple(colors[f])
        totals[key] = totals.get(key, 0.0) + float(area)
    color = max(totals, key=lambda key: (totals[key], key))
    out = colors.copy()
    out[old] = color
    return out, totals[color] / sum(totals.values())


def add_eye_shells(verts, bind, tris, colors, dark, eyes, rule):
    """Adds a gloss shell over each eye: a fan from the middle of the eye to at most `points`
    points of the edge of the dark faces, lifted along the normal of the eye in the bind mesh. The
    fan needs fewer faces than a copy of the faces of the eye. The faces under it take the mean
    fur color of their neighbors, as an input of the palette. `pnpm studio-body` finds the eye by
    its fan, drops the fan, and the app puts the pea eye at its place (design 4.5). Gives the new
    vertices of the source and of the bind mesh, the triangles, the colors, the materials, the
    faces of each old eye (`old_eye_faces()`), and the patches of the dark faces near each old eye
    (`dark_faces_near()`)."""
    lift, points = rule['lift'], rule['points']
    material = np.array(['fur'] * len(tris), dtype=object)
    new_src, new_bind, new_tris, new_colors = [verts], [bind], [tris], [colors.copy()]
    count = len(verts)
    eye_faces = np.concatenate([eyes['L'], eyes['R']])
    old, edges, near = {}, {}, {}
    neighbors = {}
    for f, t in enumerate(tris):
        for k in range(3):
            edge = tuple(sorted((t[k], t[(k + 1) % 3])))
            neighbors.setdefault(edge, []).append(f)
    for side in 'LR':
        faces = eyes[side]
        if len(faces) == 0:
            continue
        loop = boundary_loop(tris[faces])
        if len(loop) < 3:
            raise SystemExit(f'The eye {side} has no closed edge.')
        n = min(points, len(loop))
        ring = [loop[k * len(loop) // n] for k in range(n)]
        normal = np.zeros(3)
        for f in faces:
            a, b, c = bind[tris[f]]
            normal += np.cross(b - a, c - a)
        normal = unit(normal)
        corners = np.unique(tris[faces])
        old[side] = old_eye_faces(bind, tris, faces, loop, normal, rule)
        edges[side] = (loop, normal)
        fan = [[0, 1 + k, 1 + (k + 1) % n] for k in range(n)]
        for target, place in ((new_src, verts), (new_bind, bind)):
            # The eye bulges, so the middle of the fan goes to the top of the dark faces, and the
            # fan rises until each corner of the dark faces lies under it.
            middle = place[corners].mean(axis=0)
            middle += normal * (place[corners] - middle).dot(normal).max()
            shell = np.vstack([middle, place[ring]])
            gap = fan_gap(shell, fan, place[corners], normal)
            target.append(shell + (lift + gap) * normal)
        new_tris.append(np.array([[count, count + 1 + k, count + 1 + (k + 1) % n]
                                  for k in range(n)]))
        new_colors.append(np.tile(colors[faces].mean(axis=0), (n, 1)))
        count += n + 1
        log(f'eye {side}: {len(faces)} dark faces, an edge of {len(loop)} points, a fan of {n} '
            f'faces, {gap + lift:.4f} u over the eye, {len(old[side])} faces of the old eye')
        # The faces under the shell take the mean color of the fur faces around the eye.
        around = set()
        for f in faces:
            t = tris[f]
            for k in range(3):
                around.update(neighbors[tuple(sorted((t[k], t[(k + 1) % 3])))])
        around -= set(eye_faces.tolist())
        fur = colors[sorted(around)].mean(axis=0) if around else colors[faces].mean(axis=0)
        new_colors[0][faces] = fur
    taken = set(int(f) for faces in old.values() for f in faces)
    for side, (loop, normal) in edges.items():
        near[side] = dark_faces_near(bind, tris, dark, taken, loop, normal, rule)
        taken |= set(int(f) for patch in near[side] for f in patch)
    tris_out = np.concatenate(new_tris)
    material = np.concatenate([material, np.array(['gloss'] * (len(tris_out) - len(tris)),
                                                  dtype=object)])
    return (np.concatenate(new_src), np.concatenate(new_bind), tris_out,
            np.concatenate(new_colors), material, old, near)


def correctives(src, bind, weights, turns, src_heads, bind_heads, upper_share=None):
    """Finds the move of each vertex in the bind pose that the skin of the clip `reference` takes
    to its source place: d = A⁻¹ (source − b) − bind, with the skin A p + b of the clip. Gives the
    moves, the smallest determinant of A, and the vertex of it. `turns` holds the world turn of
    each bone from the bind pose to the source (`clip_turns()`). With a share `upper_share`,
    `weights` holds the twist bones of the upper arms after the bones (`upper_twist()`), and they
    turn as in the app (`twist_matrices()`)."""
    a = np.zeros((len(src), 3, 3))
    b = np.zeros((len(src), 3))
    for k, name in enumerate(BONES):
        w = weights[:, k]
        if not w.any():
            continue
        back = turns[name]
        a += w[:, None, None] * back
        b += w[:, None] * (src_heads[name] - back @ bind_heads[name])
    if upper_share is not None:
        for k, m in enumerate(twist_matrices(turns, bind_heads, src_heads, upper_share)):
            w = weights[:, len(BONES) + k]
            a += w[:, None, None] * m[:, :3]
            b += w[:, None] * m[:, 3]
    det = np.linalg.det(a)
    worst = int(np.argmin(np.abs(det)))
    moves = np.linalg.solve(a, (src - b)[:, :, None])[:, :, 0] - bind
    return moves, float(det[worst]), worst


def clip_turns(turns, bind_heads):
    """Gives the world turn of each bone from the seated bind pose to the source (the clip
    `reference`): the inverse of each bind turn. The arm segments and the helpers turn from the
    turns of the body bones by the rules of the app (`driven_turns()`)."""
    out = {name: turns[name].T for name in BONES}
    if any(name in SEGMENT_PARENTS for name in BONES):
        out.update(driven_turns(out, bind_heads))
    return out


def split_shapes(moves, weights, bind):
    """Splits the corrective moves into the four shapes: the vertices with an arm weight give the
    arm shapes, and the others give the leg shapes. Each kind splits by side with a smooth ramp
    across the middle plane, as the studio does."""
    arm = np.zeros(len(moves), bool)
    for side in 'LR':
        for name in arm_bones(side):
            arm |= weights[:, BONES.index(name)] > 0
    side = smoothstep(bind[:, 0], -0.02, 0.02)
    out = {}
    for kind, mask in (('arm_down', arm), ('legs_straight', ~arm)):
        part = moves * mask[:, None]
        out[f'{kind}_L'] = part * side[:, None]
        out[f'{kind}_R'] = part * (1 - side)[:, None]
    return {name: out[name] for name in SHAPES}


def raise_rules(config):
    """Gives the rules of the corrective shapes of `raise` of the config, each with the name of its
    morph target. `raise` holds one rule, or a list of rules. The first rule of a side makes the
    shape `arm_raise_<side>`, and the next rules of the side make `arm_raise_<side>2`,
    `arm_raise_<side>3`, and so on. A config with no `raise` gives no rule."""
    rules = config.get('raise', [])
    if isinstance(rules, dict):
        rules = [rules]
    if len(rules) > RAISE_LIMIT:
        raise SystemExit(f'The config has {len(rules)} rules in raise, more than {RAISE_LIMIT}.')
    seen = {'L': 0, 'R': 0}
    out = []
    for rule in rules:
        side = rule['side']
        seen[side] += 1
        out.append((rule, f'arm_raise_{side}' + (str(seen[side]) if seen[side] > 1 else '')))
    return out


#: The bone whose turn gives the weight of the shape of a rule of `raise`, by the `bone` of the
#: rule: the upper arm in the axes of the chest by default, the forearm from the upper arm for a
#: bent elbow, and the paw from the forearm for a bent wrist (`poseStudioBones()` of
#: `src/models/studio-rig.ts`).
RAISE_KEYS = {None: 'upper_arm', 'forearm': 'forearm', 'hand': 'hand'}


def rule_key_turns(rule):
    """Gives the turn of the key bone of each kind of rule of `raise` in the pose of a rule: the
    upper arm in the axes of the chest, the forearm from the upper arm, and the paw from the
    forearm, as rotation matrices. The pose of a rule turns no trunk bone."""
    turns = rule['turns']
    bone = rule.get('bone')
    if bone == 'hand':
        return {'upper_arm': np.eye(3), 'forearm': np.eye(3), 'hand': quat_matrix(turns['hand'])}
    upper = quat_matrix(turns['upper_arm']) if 'upper_arm' in turns else np.eye(3)
    fore = quat_matrix(turns['forearm']) if 'forearm' in turns else np.eye(3)
    return {'upper_arm': upper, 'forearm': fore, 'hand': np.eye(3)}


def wrist_turns(hand, heads, side):
    """Gives the turns of the forearm twist bone and of the paw for a turn `hand` of the paw from
    the forearm, as `poseStudioBones()` turns them: the twist bone takes `TWIST_SHARE` of the twist
    of the paw around the forearm of the seated bind pose. Gives two rotation matrices."""
    axis = unit(heads[f'hand_{side}'] - heads[f'forearm_{side}'])
    x, y, z, w = unit(hand)
    twist = 2 * np.arctan2(np.array([x, y, z]) @ axis, w)
    twist = (twist + np.pi) % (2 * np.pi) - np.pi
    half = TWIST_SHARE * twist / 2
    return quat_matrix([*(np.sin(half) * axis), np.cos(half)]), quat_matrix(hand)


def raise_weight(rule, turn):
    """Gives the weight of the shape of a rule of `raise` at a turn of its key bone, as
    `raiseWeight()` of `src/models/studio-rig.ts` gives it: 1 up to the first angle of the fade
    from the turn of the rule, 0 from the second angle, and a smooth step between them."""
    key = RAISE_KEYS[rule.get('bone')]
    rest = quat_matrix(rule['turns'][key])
    angle = np.degrees(np.arccos(np.clip((np.trace(rest.T @ turn) - 1) / 2, -1.0, 1.0)))
    full, none = rule['fade']
    t = float(np.clip((none - angle) / (none - full), 0.0, 1.0))
    return t * t * (3 - 2 * t)


def upper_twist(weights, points, heads):
    """Moves the weight of each upper arm near the shoulder to the twist bone of the upper arm, as
    `withUpperTwist()` of `src/models/studio-rig.ts` does in the app: the share of the twist bone
    falls from 1 to 0 over `UPPER_TWIST_SPAN`, and each vertex keeps its four largest weights.
    Gives the weights with one more column for each side, the left side first."""
    out = np.concatenate([weights, np.zeros((len(weights), 2))], axis=1)
    low, high = UPPER_TWIST_SPAN
    for k, side in enumerate('LR'):
        upper = BONES.index(f'upper_arm_{side}')
        axis = heads[f'forearm_{side}'] - heads[f'upper_arm_{side}']
        length = np.linalg.norm(axis)
        along = (points - heads[f'upper_arm_{side}']) @ (axis / length) / length
        share = np.clip((high - along) / (high - low), 0.0, 1.0)
        out[:, len(BONES) + k] = out[:, upper] * share
        out[:, upper] *= 1 - share
    return limit(out)


def twist_matrices(turns, heads, posed_at, share):
    """Gives the matrices of the twist bones of the upper arms in a pose, as `poseArm()` of
    `src/models/studio-rig.ts` turns them: each twist bone takes the share `share` of the roll of
    its upper arm from the chest, around the bind axis of the upper arm."""
    out = []
    for side in 'LR':
        upper = turns[f'upper_arm_{side}']
        chest = turns['chest']
        rest = unit(heads[f'forearm_{side}'] - heads[f'upper_arm_{side}'])
        frame = swing(chest @ rest, upper @ rest) @ chest
        x, y, z, w = matrix_quat(frame.T @ upper)
        roll = 2 * np.arctan2(np.array([x, y, z]) @ rest, w)
        roll = (roll + np.pi) % (2 * np.pi) - np.pi
        half = (share - 1) * roll / 2
        turn = upper @ quat_matrix([*(np.sin(half) * rest), np.cos(half)])
        out.append(move(turn, heads[f'upper_arm_{side}'], posed_at[f'upper_arm_{side}']))
    return out


def raise_shape(rule, bind, tris, weights, heads, down, sheet, earlier=(), upper_share=None,
                source=None):
    """Finds the corrective shape of a raised arm (`raise` of the config): the move of each vertex
    in the bind pose that relaxes the faces which the skin turns over in the pose of the rule. In
    that pose, the clavicle and the upper arm of the side take the world turns of the rule from
    the seated bind pose, the bones after the upper arm turn with it, and the arm-down shape of the
    side (`down`) has the weight that the app gives it: the place of the upper arm on the way from
    its bind direction to its direction in the pose of the source (`sheet`). Each vertex of a face
    whose cosine of `turn_dots()` is below `below` of the rule moves halfway to the middle of its
    neighbors, as `relax()` cleans the bind mesh, but only the vertices of the clavicle and of the
    upper arm of the side, and `grow` rings of their neighbors (0 when the rule has none). A ring
    lets a corner of the trunk under the armpit move, when a long face from it to the arm turns
    over. The move of each relaxed vertex goes back to the bind pose through the inverse of its
    skin. Gives the shape, the weight of the arm-down shape, the indices of the faces that turn
    over before and after, the rounds, and the moved vertices.

    A rule with `bone` "hand" is the shape of a bent wrist: the paw and the fingers of the side
    take the turn `turns.hand` from the seated bind pose, the forearm twist bone takes
    `TWIST_SHARE` of its twist around the forearm, as `poseStudioBones()` turns them, and the arm
    keeps the bind pose. The arm-down shape has no weight, and the relaxed vertices are the
    vertices of the paw, the fingers, and the forearm twist bone of the side.

    A rule of a raised arm can also give the turn `turns.forearm` of the forearm from the upper arm,
    so that the elbow bends as in the play: then the bones after the forearm turn with it. It can
    also give the turn `turns.hand` of the paw from the forearm, so that the wrist bends as in the
    pose: then the paw, the fingers, and the forearm twist bone turn as in a rule of a bent wrist,
    after the forearm. A rule of a bent elbow can give it too.

    A rule with `bone` "forearm" is the shape of a bent elbow: the clavicle and the upper arm take
    the world turns `turns.clavicle` and `turns.upper_arm` when the rule gives them, the forearm
    takes the turn `turns.forearm` from the upper arm, and the bones after the forearm turn with
    it. The relaxed vertices are the vertices of the clavicle, the upper arm, the forearm, and the
    forearm twist bone of the side.

    The shapes of the rules before this rule on the same side (`earlier`, each a rule and its
    shape) have their weights in the pose of this rule (`raise_weight()`), as in the app, so that
    the shapes add up to the relaxed places.

    With a share `upper_share` (`upperTwist` of the config), `weights` holds the twist bones of the
    upper arms after the bones (`upper_twist()`), and the twist bones turn as in the app
    (`twist_matrices()`). The twist bone of the side moves with the upper arm.

    With `armSegments` of the config, the arm segments and the helpers turn from the body bones by
    the rules of the app (`driven_turns()`), and a relaxed bone also relaxes the vertices of its
    segments and helpers (`SEGMENTS_OF`).

    With `follow`, the vertices near its points (the places of the source, `source`) move in the
    pose of the rule a share of the way to the place that the first segment of the upper arm
    gives them (`near_share()`), before the relax, also when they hang on other bones. On a
    joined arm root, the trunk weights keep the front of the root with the chest, so a raised arm
    crushes it into a dark crease. The shape moves the root with the arm only near the pose of
    the rule, so the root keeps the trunk weights at rest. With `follow.fill`, the skin within
    the reach of the points then fills its valleys and moves no vertex in (`fill_valleys()`), so
    that the soft fold between the chest and the arm fills and the round front of the root
    keeps its form.

    With `smooth`, that number of rounds of `taubin()` smooth the posed skin of the arm of the side
    before the relax: each vertex moves by its weight on the clavicle, the upper arm, the forearm,
    the forearm twist bone, and their segments (or on the bones of `smoothBones`, with no side), so
    that the paw keeps its form and the shape gives a smooth arm in the pose of the rule."""
    side = rule['side']
    turns = {name: np.eye(3) for name in BONES}
    wrist = rule.get('bone') == 'hand'
    elbow = rule.get('bone') == 'forearm'
    if wrist:
        twist, hand = wrist_turns(rule['turns']['hand'], heads, side)
        turns[f'forearm_twist_{side}'] = twist
        turns[f'hand_{side}'] = hand
        turns[f'fingers_{side}'] = hand
        upper = np.eye(3)
    else:
        keys = rule_key_turns(rule)
        upper = keys['upper_arm']
        if 'clavicle' in rule['turns'] or not elbow:
            turns[f'clavicle_{side}'] = quat_matrix(rule['turns']['clavicle'])
        turns[f'upper_arm_{side}'] = upper
        fore = upper @ keys['forearm'] if 'forearm' in rule['turns'] else upper
        for bone in ARM[1:]:
            turns[f'{bone}_{side}'] = fore
        if 'hand' in rule['turns']:
            twist, hand = wrist_turns(rule['turns']['hand'], heads, side)
            turns[f'forearm_twist_{side}'] = fore @ twist
            turns[f'hand_{side}'] = fore @ hand
            turns[f'fingers_{side}'] = fore @ hand
    segmented = any(name in SEGMENT_PARENTS for name in BONES)
    if segmented:
        turns.update(driven_turns(turns, heads))
    posed_at = posed_heads(heads, turns)
    matrices = [move(turns[n], heads[n], posed_at[n]) for n in BONES]
    if upper_share is not None:
        matrices += twist_matrices(turns, heads, posed_at, upper_share)

    rest = unit(heads[f'forearm_{side}'] - heads[f'upper_arm_{side}'])
    span = unit(sheet) - rest
    down_weight = (0.0 if wrist else
                   float(np.clip((upper @ rest - rest) @ span / (span @ span), 0.0, 1.0)))
    base = bind + down_weight * down
    keys = rule_key_turns(rule)
    for other, moves in earlier:
        if other['side'] == side:
            base = base + raise_weight(other, keys[RAISE_KEYS[other.get('bone')]]) * moves
    posed = skin(weights, matrices, base)
    moving = (('hand', 'fingers', 'forearm_twist') if wrist else
              ('upper_arm', 'clavicle', 'forearm', 'forearm_twist') if elbow else
              ('upper_arm', 'clavicle'))
    region = np.zeros(len(bind), dtype=bool)
    for bone in moving:
        region |= weights[:, BONES.index(f'{bone}_{side}')] > 0
        for part in SEGMENTS_OF[bone] if segmented else ():
            region |= weights[:, BONES.index(f'{part}_{side}')] > 0
    if upper_share is not None and 'upper_arm' in moving:
        region |= weights[:, len(BONES) + 'LR'.index(side)] > 0
    for _ in range(rule.get('grow', 0)):
        region[tris[region[tris].any(axis=1)].ravel()] = True
    before = np.nonzero(turn_dots(bind, posed, tris, weights, matrices) < 0)[0]
    start = posed
    if 'follow' in rule:
        # The first segment of the upper arm, or the upper arm of a rig with no segments.
        bone = f'upper_arm_seg0_{side}' if segmented else f'upper_arm_{side}'
        m = matrices[BONES.index(bone)]
        share = rule['follow']['share'] * near_share(source, rule['follow'])
        start = posed + share[:, None] * (base @ m[:, :3].T + m[:, 3] - posed)
        log(f"raise {side}: {int((share > 0).sum())} vertices follow the bone {bone}, at most "
            f'{share.max():.2f} of the way')
        if 'fill' in rule['follow']:
            start, lift = fill_valleys(start, tris, near_share(source, rule['follow']),
                                       rule['follow']['fill'])
            log(f'raise {side}: the valley fill moves {int((lift > 0).sum())} vertices out, at '
                f'most {lift.max(initial=0.0):.4f} u')
    if 'smooth' in rule:
        # Without the smooth, the rebuilt arm tubes of the hippo show lumps and dents in the rest
        # pose, where the arm turns far from the bind. Each vertex moves by its weight on the arm
        # bones before the paw.
        share = np.zeros(len(bind))
        parts = [part for bone in ('clavicle', 'upper_arm', 'forearm', 'forearm_twist')
                 for part in (bone, *(SEGMENTS_OF[bone] if segmented else ()))]
        for part in rule.get('smoothBones', parts):
            share += weights[:, BONES.index(f'{part}_{side}')]
        share = np.clip(share, 0.0, 1.0)
        ids = np.nonzero(share > 0)[0]
        start = taubin(start, tris, ids, share[ids], rule['smooth'])
        log(f"raise {side}: {rule['smooth']} rounds of taubin() smooth {len(ids)} vertices in the "
            f'pose of the rule')
    relaxed, rounds = relax(bind, start, tris, weights, matrices, moving=region,
                            below=rule['below'])
    after = np.nonzero(turn_dots(bind, relaxed, tris, weights, matrices) < 0)[0]

    a = np.zeros((len(bind), 3, 3))
    b = np.zeros((len(bind), 3))
    for k, m in enumerate(matrices):
        a += weights[:, k, None, None] * m[:, :3]
        b += weights[:, k, None] * m[:, 3]
    moved = np.linalg.norm(relaxed - posed, axis=1) > 0
    shape = np.zeros_like(bind)
    shape[moved] = np.linalg.solve(a[moved], (relaxed - b)[moved][:, :, None])[:, :, 0] - base[moved]
    return shape, down_weight, before, after, rounds, int(moved.sum())


def fill_valleys(points, tris, share, rule):
    """Fills the valleys of a posed skin (`follow.fill` of a rule of `raise`), and moves no vertex
    in. In each of `rounds` rounds, a vertex that lies under the middle of its neighbors along its
    normal (the area sum of the normals of its faces) moves out along that normal by `step` of
    that depth, times its `share`. A vertex on a ridge keeps its place, so the round front of an
    arm root does not shrink: a smoothing of the skin in the pose pulls it into a dark pocket.
    Gives the new places and the length of the move of each vertex."""
    neighbors = [set() for _ in range(len(points))]
    for a, b, c in tris:
        neighbors[a].update((b, c))
        neighbors[b].update((a, c))
        neighbors[c].update((a, b))
    ids = np.nonzero(share > 0)[0]
    rings = [np.array(sorted(neighbors[i]), int) for i in ids]
    out = points.copy()
    for _ in range(rule['rounds']):
        n = np.cross(out[tris[:, 1]] - out[tris[:, 0]], out[tris[:, 2]] - out[tris[:, 0]])
        normals = np.zeros_like(out)
        for k in range(3):
            np.add.at(normals, tris[:, k], n)
        normals = normals[ids] / np.maximum(np.linalg.norm(normals[ids], axis=1, keepdims=True),
                                            1e-12)
        mids = np.array([out[r].mean(axis=0) for r in rings])
        depth = np.maximum(np.einsum('ij,ij->i', mids - out[ids], normals), 0.0)
        out[ids] += (rule['step'] * share[ids] * depth)[:, None] * normals
    return out, np.linalg.norm(out - points, axis=1)


def near_share(points, rule):
    """Gives the share of each vertex of the source (`points`, source units) by its distance to
    the nearest point of `rule['points']`: 1 within `reach[0]` units, falling to 0 at `reach[1]`
    units."""
    seeds = np.asarray(rule['points'], float).reshape(-1, 3)
    near = np.linalg.norm(points[:, None, :] - seeds[None, :, :], axis=2).min(axis=1)
    full, none = rule['reach']
    return np.clip((none - near) / (none - full), 0.0, 1.0)


def spread_shape(shape, points, tris, rule):
    """Spreads the move of single vertices of a corrective shape over their neighbors (`spread`
    of a rule of `raise`). For each point of `points` (source units), the vertex of the source
    nearest to it and `rings` rings of its neighbors take, `rounds` times, the mean of their move
    and the mean move of their neighbors. The relax of a rule can move one vertex several cm to
    turn back one face, and the step to its neighbors then shows as a crease in each pose with
    the shape. Gives the new shape and the vertices of the points."""
    neighbors = [set() for _ in range(len(shape))]
    for a, b, c in tris:
        neighbors[a].update((b, c))
        neighbors[b].update((a, c))
        neighbors[c].update((a, b))
    neighbors = [np.array(sorted(n), int) for n in neighbors]
    out = shape.copy()
    seeds = [int(np.argmin(np.linalg.norm(points - np.asarray(p, float), axis=1)))
             for p in rule['points']]
    region = np.zeros(len(shape), bool)
    region[seeds] = True
    for _ in range(rule['rings']):
        region[np.concatenate([neighbors[v] for v in np.nonzero(region)[0]])] = True
    ids = np.nonzero(region)[0]
    for _ in range(rule['rounds']):
        mids = np.array([out[neighbors[v]].mean(axis=0) for v in ids])
        out[ids] = 0.5 * out[ids] + 0.5 * mids
    return out, seeds


def chair_mesh(rule, bind, weights):
    """Makes the chair under the seated body for the preview images: a seat whose top is the
    lowest point of the body over the seat, four legs, and a back. The shins and the feet hang in
    front of the seat, and the tail goes back over it, so they do not count. Gives the vertices,
    the triangles, and the seat top."""
    hw, front, back = rule['halfWidth'], rule['front'], rule['back']
    lower = [BONES.index(f'{b}_{s}') for b in ('shin', 'foot', 'toes') for s in 'LR']
    hanging = weights[:, lower].sum(axis=1) > 0.5
    tails = [BONES.index(b) for b in ('tail', TAIL_TIP) if b in BONES]
    tail = weights[:, tails].sum(axis=1) > 0.5
    seat = (np.abs(bind[:, 0]) <= hw) & (bind[:, 2] >= back) & (bind[:, 2] <= front)
    over = seat & ~hanging & ~tail
    top = float(bind[over, 1].min())
    if (seat & tail).any():
        log(f'chair: the tail goes {bind[seat & tail, 1].min() - top:.4f} u over the seat top at '
            f'its lowest point over the seat')
    # `pnpm studio-body` finds the seat height as the lowest point of the body over the seat, so
    # a foot over the seat puts the seat on the floor.
    feet = hanging & (np.abs(bind[:, 0]) <= hw) & (bind[:, 2] >= back) & (bind[:, 2] <= front)
    if feet.any():
        raise SystemExit(f'A shin or a foot lies over the chair, at z up to '
                         f'{bind[feet, 2].min():.4f} u. Move the front edge of the chair back.')
    log(f'chair: front edge at z {front} u, the shins and the feet from z '
        f'{bind[hanging, 2].min():.4f} u')
    boxes = [
        ((-hw, top - 0.02, back), (hw, top, front)),
        ((-hw, 0, back), (-hw + 0.02, top - 0.02, back + 0.02)),
        ((hw - 0.02, 0, back), (hw, top - 0.02, back + 0.02)),
        ((-hw, 0, front - 0.02), (-hw + 0.02, top - 0.02, front)),
        ((hw - 0.02, 0, front - 0.02), (hw, top - 0.02, front)),
        ((-hw, top, back), (hw, top + rule['backHeight'], back + 0.02)),
    ]
    verts, faces = [], []
    quads = ((0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5))
    for lo, hi in boxes:
        base = len(verts)
        for i in range(8):
            verts.append([(lo, hi)[i >> 2 & 1][0], (lo, hi)[i >> 1 & 1][1], (lo, hi)[i & 1][2]])
        for a, b, c, d in quads:
            faces += [[base + a, base + b, base + c], [base + a, base + c, base + d]]
    return np.array(verts, float), np.array(faces), top


def seat_extras(rule, prop, top):
    """Gives the seat of the rule `chair` for the extras of the asset: the seat of the app that
    takes its place (`prop`), the seat top, the front and the back edges on z, and the half width
    on x, in the units of the studio. `pnpm studio-body` fits the seat of the app to it. Each
    number is a 32-bit float, as a vertex of the file, so that the export gives the same values as
    from the box of a chair mesh."""
    def single(value):
        """Gives the value as a 32-bit float."""
        return float(np.float32(value))
    return {'prop': prop, 'top': single(top), 'front': single(rule['front']),
            'back': single(rule['back']), 'halfWidth': single(rule['halfWidth'])}


class GlbWriter:
    """Collects the buffer views and the accessors of a GLB file."""

    def __init__(self):
        """Starts an empty binary chunk."""
        self.bin = bytearray()
        self.views = []
        self.accessors = []

    def add(self, array, component, kind, minmax=False, normalized=False):
        """Adds an accessor of a numpy array, and gives its index."""
        data = np.ascontiguousarray(array).tobytes()
        while len(self.bin) % 4:
            self.bin.append(0)
        self.views.append({'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(data)})
        self.bin += data
        count = len(array)
        accessor = {'bufferView': len(self.views) - 1, 'componentType': component,
                    'count': count, 'type': kind}
        if normalized:
            accessor['normalized'] = True
        if minmax:
            flat = np.asarray(array, float).reshape(count, -1)
            accessor['min'] = [float(np.float32(x)) for x in flat.min(axis=0)]
            accessor['max'] = [float(np.float32(x)) for x in flat.max(axis=0)]
        self.accessors.append(accessor)
        return len(self.accessors) - 1

    def floats(self, array, kind, minmax=False):
        """Adds an accessor of 32-bit floats."""
        return self.add(np.asarray(array, np.float32), 5126, kind, minmax)


def primitive_arrays(points, tris, colors, materials, weights, shapes, name, base=None):
    """Gives the vertex arrays of the faces of one material: each corner with its face color is
    one vertex, so that each face keeps one color. With `base`, the colors before
    `colors.shift`, each vertex also has the base color of its face."""
    faces = np.nonzero(materials == name)[0]
    keys, index, corners = {}, [], []
    for f in faces:
        c = tuple(np.round(linear(colors[f]), 7))
        b = c if base is None else tuple(np.round(linear(base[f]), 7))
        row = []
        for v in tris[f]:
            key = (int(v), c, b)
            if key not in keys:
                keys[key] = len(index)
                index.append(key)
            row.append(keys[key])
        corners.append(row)
    vertex = np.array([k[0] for k in index])
    color = np.array([k[1] for k in index])
    base_color = np.array([k[2] for k in index])
    joints = np.zeros((len(vertex), 4), np.uint8)
    values = np.zeros((len(vertex), 4), np.float32)
    for i, v in enumerate(vertex):
        bones = sorted(np.nonzero(weights[v] > 0)[0], key=lambda k: (-weights[v, k], k))
        for j, k in enumerate(bones):
            joints[i, j] = k
            values[i, j] = weights[v, k]
    return {
        'position': points[vertex], 'color': color, 'base': base_color, 'joints': joints,
        'weights': values,
        'shapes': [shape[vertex] for shape in shapes.values()],
        'indices': np.array(corners, np.uint32),
    }


def write_glb(path, config, bind, tris, colors, materials, weights, shapes, bind_frames,
              bind_heads, src_frames, src_heads, extras, base=None, sit=None,
              generator='zoophony tools/blender/rig_mesh.py'):
    """Writes the rig as a GLB file in the format of a studio body, with the extras of the asset
    for `pnpm studio-body`. The file holds only the animal: the seat is numbers in the extras
    (`seat_extras()`). The morph targets are the shapes, in their order. With `base`, the colors
    before `colors.shift`, the attribute `COLOR_1` holds them. With `sit`, the world frame and the
    head of each bone in the sit pose (`sitPose` of the config), the file also has the clip
    `sit`. `generator` names the script that writes the file: `export_rig.py` also writes with
    this function."""
    w = GlbWriter()
    shape_names = list(shapes)
    mats = [{'name': name, 'doubleSided': True,
             'pbrMetallicRoughness': {'metallicFactor': 0.0, 'roughnessFactor': rough}}
            for name, rough in MATERIALS]

    primitives = []
    for k, (name, _) in enumerate(MATERIALS):
        arrays = primitive_arrays(bind, tris, colors, materials, weights, shapes, name, base)
        attributes = {
            'POSITION': w.floats(arrays['position'], 'VEC3', minmax=True),
            'COLOR_0': w.floats(arrays['color'], 'VEC3'),
        }
        if base is not None:
            attributes['COLOR_1'] = w.floats(arrays['base'], 'VEC3')
        attributes['JOINTS_0'] = w.add(arrays['joints'], 5121, 'VEC4')
        attributes['WEIGHTS_0'] = w.floats(arrays['weights'], 'VEC4')
        primitives.append({
            'attributes': attributes,
            'indices': w.add(arrays['indices'].ravel(), 5125, 'SCALAR'),
            'material': k,
            'targets': [{'POSITION': w.floats(s, 'VEC3', minmax=True)} for s in arrays['shapes']],
        })

    # The joints: the local place and turn of each bone in the bind pose and in the clip.
    def local(frames, heads, name):
        parent = PARENTS[name]
        if parent is None:
            return heads[name], frames[name]
        back = frames[parent].T
        return back @ (heads[name] - heads[parent]), back @ frames[name]

    first = 1
    nodes = [{'name': config['name'], 'mesh': 0, 'skin': 0}]
    joint_index = {name: first + k for k, name in enumerate(BONES)}
    inverse = []
    for name in BONES:
        t, r = local(bind_frames, bind_heads, name)
        node = {'name': name, 'rotation': [float(x) for x in matrix_quat(r)],
                'translation': [float(x) for x in t]}
        children = [joint_index[c] for c in BONES if PARENTS[c] == name]
        if children:
            node['children'] = children
        nodes.append(node)
        world = np.eye(4)
        world[:3, :3] = bind_frames[name]
        world[:3, 3] = bind_heads[name]
        inverse.append(np.linalg.inv(world).T.ravel())
    nodes.append({'name': f"{config['name']}Rig", 'children': [0, joint_index['root']]})

    times = w.floats(np.zeros(1), 'SCALAR', minmax=True)

    def clip(name, frames, heads, weights):
        """Gives the animation of one key: the local place and turn of each bone, and the
        weights of the morph targets."""
        channels, samplers = [], []
        for bone in BONES:
            t, r = local(frames, heads, bone)
            for target, value, kind in (('translation', t, 'VEC3'),
                                        ('rotation', matrix_quat(r), 'VEC4')):
                samplers.append({'input': times, 'output': w.floats(np.asarray([value]), kind),
                                 'interpolation': 'LINEAR'})
                channels.append({'sampler': len(samplers) - 1,
                                 'target': {'node': joint_index[bone], 'path': target}})
        samplers.append({'input': times, 'output': w.floats(np.array(weights), 'SCALAR'),
                         'interpolation': 'LINEAR'})
        channels.append({'sampler': len(samplers) - 1, 'target': {'node': 0, 'path': 'weights'}})
        return {'name': name, 'channels': channels, 'samplers': samplers}

    # The clip `reference` gives the source back: each shape has its full weight, but the shapes
    # of a raised arm and the sit shapes. The clip `sit` of a body with a sit pose gives the sit
    # mesh back with the sit shapes alone.
    animations = [clip('reference', src_frames, src_heads,
                       [0.0 if name.startswith(('arm_raise', 'sit_')) else 1.0
                        for name in shape_names])]
    if sit is not None:
        animations.append(clip('sit', *sit,
                               [1.0 if name.startswith('sit_') else 0.0 for name in shape_names]))

    gltf = {
        'asset': {'generator': generator, 'version': '2.0'},
        'scene': 0,
        'scenes': [{'name': 'Scene', 'nodes': [len(nodes) - 1]}],
        'nodes': nodes,
        'animations': animations,
        'materials': mats,
        'meshes': [
            {'name': config['name'], 'primitives': primitives,
             'weights': [0.0] * len(shape_names), 'extras': {'targetNames': shape_names}},
        ],
        'skins': [{'name': f"{config['name']}Rig", 'joints': [joint_index[n] for n in BONES],
                   'skeleton': joint_index['root'],
                   'inverseBindMatrices': w.floats(np.array(inverse), 'MAT4')}],
        'accessors': w.accessors,
        'bufferViews': w.views,
        'buffers': [{'byteLength': len(w.bin)}],
    }
    gltf['asset']['extras'] = extras
    text = json.dumps(gltf, separators=(',', ':')).encode()
    text += b' ' * (-len(text) % 4)
    data = bytes(w.bin) + b'\0' * (-len(w.bin) % 4)
    gltf['buffers'][0]['byteLength'] = len(w.bin)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(text) + 8 + len(data))
    out += struct.pack('<II', len(text), 0x4E4F534A) + text
    out += struct.pack('<II', len(data), 0x004E4942) + data
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(out)
    log(f'wrote {path}: {len(out)} bytes')


def bone_color(index):
    """Gives a color for a bone: hues by the golden ratio, so that neighbors differ."""
    return colorsys.hsv_to_rgb((index * 0.61803) % 1.0, 0.7, 0.95)


def preview(out, parts):
    """Renders the preview images. Each part is (name, [(vertices, triangles, sRGB face colors)],
    [(view name, azimuth in degrees, elevation in degrees, center, size)])."""
    os.makedirs(out, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'VERTEX'
    scene.render.resolution_x = scene.render.resolution_y = VIEW
    scene.world = bpy.data.worlds.new('world')
    camera = bpy.data.cameras.new('camera')
    camera.type = 'ORTHO'
    cam = bpy.data.objects.new('camera', camera)
    scene.collection.objects.link(cam)
    scene.camera = cam
    for name, meshes, views in parts:
        objects = []
        for k, (verts, tris, colors) in enumerate(meshes):
            mesh = bpy.data.meshes.new(f'{name}{k}')
            mesh.from_pydata(to_blender(verts).tolist(), [], np.asarray(tris).tolist())
            mesh.update()
            attr = mesh.color_attributes.new('color', 'FLOAT_COLOR', 'CORNER')
            rgba = np.concatenate([linear(colors), np.ones((len(colors), 1))], axis=1)
            attr.data.foreach_set('color', np.repeat(rgba, 3, axis=0).ravel().astype(np.float32))
            ob = bpy.data.objects.new(f'{name}{k}', mesh)
            scene.collection.objects.link(ob)
            objects.append(ob)
        paths = []
        for view, azimuth, elevation, center, size in views:
            a, e = math.radians(azimuth), math.radians(elevation)
            # The azimuth 0 looks at the front of the animal, which faces -y in Blender.
            d = np.array([math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)])
            camera.ortho_scale = size
            cam.location = (to_blender(center) + d * 5).tolist()
            cam.rotation_euler = Vector((-d).tolist()).to_track_quat('-Z', 'Y').to_euler()
            path = os.path.join(out, f'{name}-{view}.png')
            scene.render.filepath = path
            bpy.ops.render.render(write_still=True)
            paths.append(path)
        images = [bpy.data.images.load(p) for p in paths]
        pixels = [np.array(img.pixels[:], np.float32).reshape(VIEW, VIEW, 4) for img in images]
        sheet = bpy.data.images.new(name, VIEW * len(pixels), VIEW)
        sheet.pixels = np.concatenate(pixels, axis=1).ravel()
        sheet.filepath_raw = os.path.join(out, f'{name}.png')
        sheet.file_format = 'PNG'
        sheet.save()
        for img in images:
            bpy.data.images.remove(img)
        for p in paths:
            os.remove(p)
        for ob in objects:
            bpy.data.objects.remove(ob)
        log(f'preview: {sheet.filepath_raw}')


def write_obj(path, verts, tris):
    """Writes a mesh as an OBJ file."""
    with open(path, 'w') as f:
        for v in verts:
            f.write(f'v {v[0]:.7f} {v[1]:.7f} {v[2]:.7f}\n')
        for t in tris:
            f.write(f'f {t[0] + 1} {t[1] + 1} {t[2] + 1}\n')


def main():
    config_path, out_path, preview_dir, obj_path, faces_path, corners_path, check = args()
    with open(config_path) as f:
        config = json.load(f)
    rules = config['weights']
    global BONES
    if TAIL_TIP in config['joints']:
        BONES = BONES + (TAIL_TIP,)
    if JAW in config['joints']:
        BONES = BONES + (JAW,)

    verts, source_tris, uvs, texture = load_mesh(config)
    unsmoothed = verts
    if 'smooth' in config:
        verts, count, largest = smooth_box(verts, source_tris, config['smooth'])
        log(f'smooth: {count} vertices in the box, the largest move {largest:.4f} u')
    heads, ends, rolls, children = joints_of(config)
    if 'cut' in config:
        before = len(source_tris)
        source_tris, uvs, seam_cut = cut_seam(verts, source_tris, uvs, rules, heads, ends,
                                              config['cut'])
        for side, removed, faces, arm_run, body_run in seam_cut:
            angles = min_angles(verts, np.array(faces))
            log(f'cut {side}: {len(removed)} faces go, {len(faces)} new faces close the hole '
                f'(smallest angle {angles.min():.1f} degrees, median {np.median(angles):.1f}), '
                f'the arm run {arm_run}, the body run {body_run}')
        log(f'cut: {before} triangles before, {len(source_tris)} after')
    # With `weightSource`, the weights come from that mesh, the mesh before a planar split of its
    # faces, and each vertex of the source takes the weights of its place on it (`placed_weights()`).
    mesh_verts, mesh_tris = verts, source_tris
    if 'weightSource' in config:
        if 'smooth' in config or 'cut' in config:
            raise SystemExit('weightSource takes no smooth and no cut.')
        verts, source_tris, _, _ = load_mesh({**config, 'source': config['weightSource']})
        unsmoothed = verts
    if 'paintedWeights' in config:
        rule_weights = None
        if config.get('paintedLower'):
            # The lower body keeps the weights of the rules: the seated bind of the app (the sit
            # of the haunch onto the seat and the tail ball) depends on them. The rules see the
            # body bones only, before the arm segments join the bones.
            rule_weights = apply_rules(verts, source_tris,
                                       kept_heat(verts, source_tris, heads, ends, rolls, config),
                                       rules,
                                       heads, ends)
            rule_weights = straight_slivers(verts, source_tris,
                                            rigid_slivers(verts, source_tris, rule_weights, rules),
                                            rules)
            rule_weights = rigid_faces(verts, source_tris, rule_weights, rules)
        if 'armSegments' in config:
            # The arm segments and the helpers join the bones after the body bones
            # (`segment_bones()`), as the optional bones of `STUDIO_BONES` do.
            if 'upperTwist' in config:
                raise SystemExit('armSegments replaces upperTwist: remove it from the config.')
            if config['armFactor'] != 1 or config.get('bind', {}).get('blend', 'linear') != 'linear':
                raise SystemExit('armSegments needs the arm factor 1 and the linear bind.')
            BONES = BONES + segment_bones()
            segment_joints(heads, ends, rolls, children, config['armSegments'])
            if rule_weights is not None:
                rule_weights = np.concatenate(
                    [rule_weights, np.zeros((len(verts), len(segment_bones())))], axis=1)
                if config['armSegments'].get('rootSegment'):
                    # The rule weight of each upper arm goes to its first segment, so that the
                    # skin around the socket takes the roll of the first ring of the tube.
                    for side in 'LR':
                        old, new = BONES.index(f'upper_arm_{side}'), BONES.index(
                            f'upper_arm_seg0_{side}')
                        rule_weights[:, new] += rule_weights[:, old]
                        rule_weights[:, old] = 0.0
        # The painted file holds the places of the source, before the smooth of a box.
        weights = painted_weights(unsmoothed, config['paintedWeights'])
        if rule_weights is not None:
            # Each vertex mixes the painted weights and the rule weights by its painted share on
            # the lower bones.
            names = (LOWER_BONES if config['paintedLower'] == 'rules'
                     else tuple(config['paintedLower']))
            lower = [BONES.index(b) for b in BONES if b in names]
            share = np.clip(weights[:, lower].sum(axis=1), 0.0, 1.0)[:, None]
            weights = (1.0 - share) * weights + share * rule_weights
            log(f'weights: painted in Blender, the rules on the lower body '
                f'({int((share[:, 0] > 0.5).sum())} vertices mostly on the rules)')
        else:
            log(f"weights: painted in Blender ({config['paintedWeights']}), no rules")
        weights = limit(weights)
        if 'paintedBelow' in rules:
            weights = painted_below(verts, weights, heads, rules['paintedBelow'])
        if rules.get('rigidPainted'):
            # The thin faces at these points take the mean of the painted weights of their corners,
            # as `rigid` does for the rule weights.
            weights = limit(rigid_faces(verts, source_tris, weights,
                                        {'rigid': rules['rigidPainted']}))
    else:
        weights = apply_rules(verts, source_tris,
                              kept_heat(verts, source_tris, heads, ends, rolls, config), rules, heads,
                              ends)
        weights = straight_slivers(verts, source_tris,
                                   rigid_slivers(verts, source_tris, weights, rules), rules)
        weights = limit(rigid_faces(verts, source_tris, weights, rules))
    if 'weightSource' in config:
        weights, kept = placed_weights(mesh_verts, verts, source_tris, weights)
        log(f"weights: {kept} of {len(mesh_verts)} vertices take the weights of the vertex at "
            f"their place in {config['weightSource']}, and the others the mix on their face")
        verts, source_tris = mesh_verts, mesh_tris
        unsmoothed = verts

    if 'armSmooth' in config:
        verts, count, largest = arm_smooth(verts, source_tris, weights, config['armSmooth'])
        log(f'armSmooth: {count} vertices of the arm tubes, at most {largest:.4f} u')

    # The long arms, the long legs, the large head, and the short trunk. The scale of the app comes
    # from the shoulder joints after the rise of the legs and the drop of the trunk.
    if 'girthProfile' in config and 'girthFactor' in config:
        raise SystemExit('girthProfile replaces girthFactor: remove one of them from the config.')
    factors = {'arm': config['armFactor'], 'leg': config.get('legFactor', 1),
               'shin': config.get('shinFactor', config.get('legFactor', 1)),
               'head': config.get('headFactor', 1), 'neck': config.get('neckFactor', 1),
               'trunk': config.get('trunkFactor', 1),
               'trunkTop': config.get('trunkTop', 'neck'),
               'girth': config.get('girthProfile', [[0, *girth_row(config)]]),
               'armGirth': config.get('armGirth', [1, 1]),
               'legGirth': config.get('legGirth', [1, 1])}
    long_verts, long_heads, long_ends, rise, drop, lower = stretch(verts, weights, heads, ends,
                                                                    children, factors, rules)
    stretched = stretch_faces(verts, long_verts, source_tris) if check else []
    meters = config['app']['shoulders'] / long_heads['upper_arm_L'][1]
    for side in 'LR':
        before, after = reach(heads, side) * meters, reach(long_heads, side) * meters
        log(f'arm {side}: reach {before:.4f} m before, {after:.4f} m after the factor '
            f"{config['armFactor']} (target {config['app']['reach']} m)")
    if tuple(factors['legGirth']) != (1, 1):
        log(f"legGirth: the thighs and the shins take the factors {factors['legGirth']} across "
            f"their axes")
    if factors['shin'] != factors['leg']:
        log(f"shins: the shin factor {factors['shin']} makes the shins longer than the thighs "
            f"(leg factor {factors['leg']})")
    if factors['leg'] != 1 or factors['shin'] != 1 or factors['head'] != 1:
        log(f"legs and head: the leg factor {factors['leg']} raises the body {rise:.4f} u, the "
            f"shoulder joint to {long_heads['upper_arm_L'][1]:.4f} u "
            f"({long_heads['upper_arm_L'][1] * meters:.4f} m), and the head factor "
            f"{factors['head']} grows the head around the neck joint")
    if factors['neck'] != 1:
        neck = np.linalg.norm(long_heads['head'] - long_heads['neck'])
        log(f"neck: the neck factor {factors['neck']} moves the head {np.linalg.norm(drop):.4f} u "
            f"({np.linalg.norm(drop) * meters * 100:.2f} cm) down the neck, and the neck joint is "
            f"{neck:.4f} u ({neck * meters * 100:.2f} cm) from the head joint")
    if factors['trunk'] != 1:
        trunk = np.linalg.norm(long_heads['neck'] - long_heads['hips'])
        log(f"trunk: the trunk factor {factors['trunk']} moves the neck joint "
            f"{np.linalg.norm(lower):.4f} u ({np.linalg.norm(lower) * meters * 100:.2f} cm) down the "
            f"trunk, the neck joint is {trunk:.4f} u ({trunk * meters * 100:.2f} cm) from the hips "
            f"joint, and the shoulder joint is "
            f"{long_heads['upper_arm_L'][1] - long_heads['hips'][1]:.4f} u "
            f"({(long_heads['upper_arm_L'][1] - long_heads['hips'][1]) * meters * 100:.2f} cm) "
            f"above it")

    if any(tuple(row[1:]) != (1, 1, 1) for row in factors['girth']):
        hips = long_heads['hips']
        axis = unit(long_heads['neck'] - hips)
        across = {}
        for name in ('upper_arm_L', 'thigh_L', 'tail'):
            rel = long_heads[name] - hips
            across[name] = np.linalg.norm(rel - (rel @ axis) * axis)
        log(f"girth: the girth rows {factors['girth']} (share, width, front, back) widen the "
            f"trunk across its axis. The shoulder joint is {across['upper_arm_L']:.4f} u, the hip joint "
            f"{across['thigh_L']:.4f} u, and the root of the tail {across['tail']:.4f} u from the "
            f"axis")
    src_frames = {n: frame(long_heads[n], long_ends[n], rolls[n]) for n in BONES}
    # The upright seated bind keeps the trunk of the source. A recline (`studio.trunk`) turns the
    # trunk back from it around the head of the hips, which keeps the hip joints, the thighs, and
    # the feet in place.
    upright_turns = bind_turns(config, long_heads, long_ends, rolls)
    upright_heads = posed_heads(long_heads, upright_turns)
    upright_matrices = [move(upright_turns[n], long_heads[n], upright_heads[n]) for n in BONES]
    trunk = trunk_turn(config, long_heads, long_ends, rolls)
    turns = bind_turns(config, long_heads, long_ends, rolls, trunk)
    bind_heads = posed_heads(long_heads, turns)
    hinges = bind_hinges(config, turns, long_heads, long_ends)
    bind_frames = {n: turns[n] @ src_frames[n] for n in BONES}
    matrices = [move(turns[n], long_heads[n], bind_heads[n]) for n in BONES]
    if trunk:
        rule = config['studio']['trunk']
        head = np.degrees(np.arccos(np.clip(turns['head'][1, 1], -1.0, 1.0)))
        log(f"trunk: the pelvis turns {trunk:.2f} degrees back, so that the hip angle opens "
            f"{rule['open']} degrees, from {hip_angle(upright_heads):.1f} to "
            f"{hip_angle(bind_heads):.1f} degrees. The shares of the turn: {rule['shares']}. The "
            f"head turns {head:.2f} degrees")

    # The faces of the arms change so that they bend at the joints. The head, the trunk, and the
    # legs keep their faces, their vertices, and their weights. The arms of the upright bind give
    # the thin faces, so that a recline does not change the faces.
    long_verts, tris, uvs, weights, flips, largest, cuts, origin = refine(
        long_verts, source_tris, uvs, weights, long_heads, long_ends, upright_matrices, config,
        verts)
    log(f'refine: {flips} flips, the largest move {largest * meters * 1000:.3f} mm, {cuts} cut '
        f'edges, {len(tris) - len(source_tris)} new faces')
    thin_rule = config['check']['thin'] if check else None
    uncut = uncut_faces(long_verts, tris, long_heads, long_ends, thin_rule) if thin_rule else []
    colors, dark, dark_share = face_colors(tris, uvs, texture, config['colors'])
    # The caps of the arm that take the normals of the skin in the app (`skinNormals` of the cut),
    # with the parts of a split, and the skin faces of the rim of the caps of the body.
    skin_caps = np.zeros(len(tris), bool)
    rim = np.zeros(len(tris), bool)
    if 'cut' in config:
        # The caps of the body and the quads at the top take the white of the belly: the color of
        # the nearest light face that the cut keeps. The caps of the arm keep the black of the arm
        # from the faces across their edges.
        start = len(source_tris) - sum(len(c[2]) for c in seam_cut)
        arm_cap = np.zeros(len(source_tris), bool)
        body_cap = np.zeros(len(source_tris), bool)
        # The new faces of the sides of `bodyNormals`.
        chosen = np.zeros(len(source_tris), bool)
        sides = config['cut'].get('bodyNormals', '')
        light = oklab(colors)[:, 0] >= 0.5
        mids = long_verts[tris].mean(axis=1)
        kept = np.nonzero(light & (np.arange(len(tris)) < start))[0]
        k = start
        for side, removed, faces, arm_run, body_run in seam_cut:
            arm_side = set(arm_run)
            for f in faces:
                chosen[k] = side in sides
                if not all(v in arm_side for v in f):
                    colors[k] = colors[kept[np.argmin(np.linalg.norm(mids[kept] - mids[k], axis=1))]]
                    dark[k] = False
                    body_cap[k] = side in sides and not any(v in arm_side for v in f)
                else:
                    arm_cap[k] = True
                k += 1
        if config['cut'].get('skinNormals', False):
            skin_caps = arm_cap[origin]
        if sides:
            # The caps of the body and the quads at the top lie in the notch of the side of the
            # trunk, and a raised arm turns them away from the light too.
            skin_caps |= chosen[origin]
            rim = cut_rim(tris, body_cap[origin], arm_cap[origin])
    # The faces of `rootNormals`, apart from the rim of the cut: the final bind can take some of
    # them out (`rim_turns()`).
    root = np.zeros(len(tris), bool)
    if 'rootNormals' in config:
        root = root_rim(long_verts, tris, long_heads, config['rootNormals'], weights)
    # The move of the head from the source: the pivot, the head factor, the rise, and the drop.
    head_move = (heads['neck'], factors['head'], rise,
                 drop + lower if factors['trunk'] != 1 else drop)
    boxes = moved_boxes(config['colors'], *head_move)
    if 'noseShare' in config['colors']:
        # A large face at the edge of the black nose of the texture takes black from the share
        # `eyeShare` of dark samples, and shows as a black wedge on the muzzle. In the nose box, a
        # face is dark only from the share `noseShare`, and else takes the mean of its light samples.
        centers = long_verts[tris].mean(axis=1)
        partial = dark & in_box(centers, boxes['noseBox']) & (
            dark_share < config['colors']['noseShare'])
        grid = sample_grid(config['colors']['samples'])
        for f in np.nonzero(partial)[0]:
            samples = face_samples(uvs[f], grid, texture)
            colors[f] = samples[luminance(samples) >= config['colors']['dark']].mean(axis=0)
            dark[f] = False
        log(f'noseShare: {int(partial.sum())} faces of the nose box with a share of dark samples '
            f"below {config['colors']['noseShare']} keep the fur: {np.nonzero(partial)[0].tolist()}")
    eyes, nose = features(long_verts, tris, colors, dark, boxes)
    if check:
        dark_check(long_verts[tris].mean(axis=1), dark,
                   dark_ranks(tris, uvs, texture, config['colors']), boxes)
    for side, found in eye_patches(tris, dark, eyes).items():
        for inside, rest in found:
            text = (f'eye {side}: the eye box takes {len(inside)} of the '
                    f'{len(inside) + len(rest)} faces of a dark patch. The Oklab lightness of the '
                    f'eye faces is {lightness_text(colors[inside])}, and of the other faces of the '
                    f'patch {lightness_text(colors[rest])}')
            if len(inside) > len(rest):
                warn(f'{text}. The box takes more than half of the patch, so the color of the old '
                     f'eye leaves light holes in it. Make colors.eyeBox hold only the eye.')
            else:
                log(text)

    # The upright seated bind: the trunk of the source on the seat. The sit lowers its haunch onto
    # the seat. A reclined trunk then turns from it (`studio.trunk`).
    bind = bind_skin(config, weights, upright_matrices, long_verts)
    if 'tailCurl' in config['studio']:
        bind, count = tail_curl(long_verts, bind, tris, weights, long_heads, long_ends,
                                upright_heads['tail'], config['studio']['tailCurl'])
        log(f'tail: {count} vertices curl along the curve of tailCurl')
    dots = turn_dots(long_verts, bind, tris, weights, upright_matrices)
    main_bone = weights[tris].sum(axis=1).argmax(axis=1)
    turned = np.nonzero(dots < 0)[0]
    names = sorted({BONES[main_bone[f]] for f in turned})
    free = int(free_arm(verts, source_tris, rules, heads, ends, 1.0).sum())
    log(f'arm: {free} vertices in the free left arm beyond |x| = {rules["armSplit"]}')
    log(f'bind: {len(turned)} faces turn over from the source, on the bones {names}')
    bind, rounds = relax(long_verts, bind, tris, weights, upright_matrices)
    dots = turn_dots(long_verts, bind, tris, weights, upright_matrices)
    log(f'bind: after {rounds} rounds of relaxing, {int((dots < 0).sum())} faces turn over'
        f'{turned_on(dots, main_bone)}')
    if 'bindSmooth' in config:
        # The seated bind bends each elbow far, and the inner elbow folds into a lip, which the
        # bind mesh of the GLB file shows as a bump near the elbow. The rule of `arm_smooth()`
        # smooths the bind mesh of the bones of the rule after the relax.
        bind, count, largest = arm_smooth(bind, tris, weights, config['bindSmooth'])
        dots = turn_dots(long_verts, bind, tris, weights, upright_matrices)
        log(f'bindSmooth: {count} vertices of the bind elbows, at most {largest:.4f} u, '
            f'{int((dots < 0).sum())} faces turn over{turned_on(dots, main_bone)}')
    top, low, front = haunch_gap(bind, weights, config['chair'], config.get('sit', {}),
                                 float(upright_heads['hips'][2]))
    gap = (low - top) * meters
    log(f'seat: before the sit, the lowest point of the haunch behind the hips joint is '
        f'{abs(gap) * 100:.2f} cm {"above" if gap >= 0 else "below"} the seat top {top:.4f} u')
    if gap > SEAT_WARNING:
        warn(f'seat: the haunch is {gap * 100:.2f} cm above the seat top, so the thighs set the '
             f'seat top and the sit pulls the haunch down. The front edge of the chair at z '
             f'{front} u (chair.front, now {config["chair"]["front"]}) puts the seat under the '
             f'haunch.')
    if 'sit' in config:
        hip = float(upright_heads['thigh_L'][2])
        bind, moved, largest, before, after = sit(bind, tris, weights, config['chair'],
                                                  config['sit'], hip)
        dots = turn_dots(long_verts, bind, tris, weights, upright_matrices)
        log(f'sit: {moved} vertices of the haunch move down, at most {largest:.4f} u '
            f'({largest * meters * 100:.2f} cm). The side view of the underside behind the hip '
            f'joints is at most {before * meters * 100:.2f} cm above the seat before and '
            f'{after * meters * 100:.2f} cm after. {int((dots < 0).sum())} faces turn over'
            f'{turned_on(dots, main_bone)}')
    if trunk:
        top = float(seat_top(bind, weights, config['chair']))
        bind = skin(weights, [after_upright(m, u) for m, u in zip(matrices, upright_matrices)],
                    bind)
        hip = float(bind_heads['thigh_L'][2])
        # The smoothing of the lifts leaves a part of the deepest lift, so the lift repeats until
        # the lowest point over the seat is within 1 mm of the seat top (at most 6 rounds). A body
        # with no sit rule, such as the standing monkey, touches no seat, so its haunch keeps its
        # form.
        lifted, most = 0, 0.0
        for _ in range(6 if 'sit' in config else 0):
            bind, count, largest = seat_lift(bind, tris, weights, config['chair'], config['sit'],
                                             top, hip)
            lifted, most = max(lifted, count), most + largest
            if top - seat_top(bind, weights, config['chair']) < 0.001 / meters:
                break
        moving = haunch_mask(weights) | default_moving(weights)
        bind, rounds = relax(long_verts, bind, tris, weights, matrices, moving=moving)
        dots = turn_dots(long_verts, bind, tris, weights, matrices)
        log(f'trunk: {lifted} vertices of the haunch and the tail rise toward the seat top '
            f'{top:.4f} u of the upright body, at most {most:.4f} u ({most * meters * 100:.2f} cm). '
            f'The lowest point over the seat is {seat_top(bind, weights, config["chair"]):.4f} u. '
            f'After {rounds} rounds of relaxing, {int((dots < 0).sum())} faces turn over'
            f'{turned_on(dots, main_bone)}')

    if config.get('crease', {}).get('rounds', 0) > 0:
        bind, seam, moved, largest = crease_relax(bind, tris, weights, bind_heads['thigh_L'],
                                                  config['crease'])
        dots = turn_dots(long_verts, bind, tris, weights, matrices)
        log(f'crease: {seam} seam vertices, {moved} vertices move, at most {largest:.4f} u '
            f'({largest * meters * 100:.2f} cm). {int((dots < 0).sum())} faces turn over'
            f'{turned_on(dots, main_bone)}')
    if config.get('kneeCrease', {}).get('rounds', 0) > 0:
        bind, seam, moved, largest, faired, most_fair = knee_relax(bind, tris, weights,
                                                                   bind_heads,
                                                                   config['kneeCrease'])
        dots = turn_dots(long_verts, bind, tris, weights, matrices)
        log(f'knee crease: {seam} seam vertices, {moved} vertices move, at most {largest:.4f} u '
            f'({largest * meters * 100:.2f} cm). {int((dots < 0).sum())} faces turn over'
            f'{turned_on(dots, main_bone)}')
        if faired:
            log(f'calf fair: {faired} vertices move along their normals, at most '
                f'{most_fair:.4f} u ({most_fair * meters * 100:.2f} cm)')
    if 'sit' in config:
        # The gap of the final bind: the recline, the lift, and the crease move the haunch after
        # the sit.
        rule = config['sit']
        _, xs, zs, gaps = seat_gaps(bind, tris, weights, config['chair'],
                                    float(bind_heads['thigh_L'][2]), rule['step'],
                                    2 * rule['band'], rule.get('root'))
        log(f'seat: the side view of the underside of the final bind behind the hip joints is at '
            f'most {silhouette_gap(xs, zs, gaps, rule["end"]) * meters * 100:.2f} cm above the '
            f'seat top')
    if 'sitPose' in config:
        # A body that binds standing also gets the sit pose of a seated bind, which its sit shapes
        # give back in the app (`seatedBody()` of `src/models/studio-rig.ts`).
        if trunk or TAIL_TIP in BONES or 'tailCurl' in config['studio']:
            raise SystemExit('sitPose needs a bind with no recline and a tail of one bone.')
        sit_mesh, sit_turns, sit_heads = sit_pose(config, weights, long_verts, tris, long_heads,
                                                  long_ends, rolls, meters)

    if 'turn' in config.get('rootNormals', {}):
        # A face of the root rim whose corner takes a skin normal far from its own face shades
        # from a direction that its surface does not have, so it keeps the crease normals.
        root_turns = rim_turns(bind, tris, skin_caps, root)
        far = root_turns > config['rootNormals']['turn']
        log(f"rootNormals: {int(far.sum())} faces of the rim take a skin normal more than "
            f"{config['rootNormals']['turn']} degrees from their face in the bind, and keep the "
            f"crease normals")
        root &= ~far
    rim |= root
    src_all, bind_all, tris_all, colors_all, materials, old_eyes, near_dark = add_eye_shells(
        long_verts, bind, tris, colors, dark, eyes, config['eyeShell'])
    materials[nose] = 'gloss'
    colors_all, worst_color, mean_color = palette(colors_all, config['colors']['palette'])
    log(f'palette: {len(np.unique(colors_all, axis=0))} colors, the Oklab distance of a face '
        f'from its color {mean_color:.4f} on the mean, {worst_color:.4f} at most')
    for side in 'LR':
        if side in old_eyes:
            colors_all, share = recolor_old_eyes(colors_all, tris, bind, old_eyes[side])
            log(f'eye {side}: the {len(old_eyes[side])} faces of the old eye take the color of '
                f'{share:.0%} of the area of the faces around it')
    for side in 'LR':
        for patch in near_dark.get(side, []):
            colors_all, share = recolor_old_eyes(colors_all, tris, bind, patch)
            mids = ', '.join('(' + ', '.join(f'{x:.3f}' for x in bind[tris[f]].mean(axis=0)) + ')'
                             for f in patch)
            log(f'eye {side}: the patch of {len(patch)} dark face(s) near the old eye at {mids} u '
                f'takes the color of {share:.0%} of the area of the faces around it')
    if 'tone' in config['colors']:
        main_all = weights[tris].sum(axis=1).argmax(axis=1)
        main_all = np.concatenate([main_all, np.full(len(tris_all) - len(tris),
                                                      BONES.index('head'))])
        colors_all, count = tone(colors_all, main_all, config['colors']['tone'])
        log(f'tone: {count} faces of the plain fur move in Oklab')
    corners = head_source(src_all[tris_all], *head_move)
    fur_all = materials == 'fur'
    if 'border' in config['colors']:
        # The faces of the eye shells come after the faces of the body, with no texture samples.
        share_all = np.concatenate([dark_share, np.ones(len(tris_all) - len(tris))])
        colors_all, changed = border_faces(corners, colors_all, fur_all, share_all,
                                           config['colors']['border'], tris_all)
        border_changed = changed
        sides = (corners[changed].mean(axis=1)[:, 0] > 0).sum()
        log(f'border: {len(changed)} dark and gray faces ({sides} left, {len(changed) - sides} right) take '
            f'the color of the nearest light fur face')
    if 'patch' in config['colors']:
        colors_all, changed, patch_dark = patch_shape(corners, colors_all, fur_all,
                                                      config['colors']['patch'])
        sides = (corners[changed].mean(axis=1)[:, 0] > 0).sum()
        log(f'patch: {len(changed)} dark faces of the eye patches ({sides} left, '
            f'{len(changed) - sides} right) take the color of the nearest light fur face. The '
            f'patches keep the color {np.round(patch_dark, 4).tolist()}')
    if 'belly' in config['colors']:
        main_trunk = weights[tris].sum(axis=1).argmax(axis=1)
        trunk_all = np.concatenate([
            np.isin(main_trunk, [BONES.index(b) for b in ('hips', 'spine', 'spine1', 'chest')]),
            np.zeros(len(tris_all) - len(tris), bool)])
        colors_all, changed = belly_patch(src_all[tris_all], long_heads['hips'],
                                          long_heads['neck'], colors_all, fur_all, trunk_all,
                                          config['colors']['belly'])
        log(f'belly: {len(changed)} faces take the color of the oval patch by the share of '
            f'their area in it')
    if 'flank' in config['colors']:
        arm_bones = [k for k, name in enumerate(BONES) if name.rsplit('_', 1)[0].startswith(
            ('upper_arm', 'forearm', 'elbow', 'wrist', 'hand', 'fingers'))]
        arm_share = np.concatenate([weights[tris][:, :, arm_bones].sum(axis=2).mean(axis=1),
                                    np.zeros(len(tris_all) - len(tris))])
        colors_all, changed = flank_faces(corners, colors_all, fur_all, arm_share,
                                          config['colors']['flank'])
        sides = (corners[changed].mean(axis=1)[:, 0] > 0).sum()
        log(f'flank: {len(changed)} black faces of the sides ({sides} left, '
            f'{len(changed) - sides} right) take the color of the nearest light face')
    if 'smile' in config['colors']:
        smile = config['colors']['smile']
        if 'color' not in smile and 'patch' not in config['colors']:
            raise ValueError('colors.smile with no color takes the dark color of colors.patch, '
                             'so it needs colors.patch.')
        edges = np.cross(corners[:, 1] - corners[:, 0], corners[:, 2] - corners[:, 0])
        normals = edges / np.maximum(np.linalg.norm(edges, axis=1, keepdims=True), 1e-12)
        # `color` of the rule (linear RGB) replaces the dark of the patches, for a mesh whose
        # patches are a gray fur, such as the wolf, or for a mesh with no patch rule, such as the
        # monkey.
        color = smile['color'] if 'color' in smile else patch_dark
        colors_all, bands = smile_line(corners, normals, colors_all, fur_all, smile,
                                       np.array(color, float))
        log(f'smile: the bands take {[len(b) for b in bands]} faces')
    base_all = colors_all
    if 'shift' in config['colors']:
        colors_all, count, limited = shift_colors(colors_all, fur_all,
                                                  config['colors']['shift'])
        log(f'shift: {count} faces of the colored fur move in Oklch, and the sRGB gamut limits '
            f'the chroma of {limited}')
    order = locality_order(tris_all)
    tris_all, colors_all, materials = tris_all[order], colors_all[order], materials[order]
    base_all = base_all[order]
    if 'border' in config['colors']:
        log(f'border: the faces of the module '
            f'{sorted(module_faces(order, materials)[border_changed].tolist())}')
    if faces_path:
        with open(faces_path, 'w') as f:
            json.dump(face_sources(verts, source_tris, len(tris), order, materials), f)
        log(f'faces: the source middles of {len(order)} faces of the module in {faces_path}')
    if corners_path:
        with open(corners_path, 'w') as f:
            json.dump(face_corners(verts, long_verts, source_tris, len(tris), order, materials), f)
        log(f'corners: the source corners of {len(order)} faces of the module in {corners_path}')
    if thin_rule:
        log_check(stretched, uncut, module_faces(order, materials),
                  weights[tris].sum(axis=1).argmax(axis=1), thin_rule)
    extra = len(src_all) - len(long_verts)
    head_only = np.zeros((extra, len(BONES)))
    head_only[:, BONES.index('head')] = 1.0
    weights_all = np.concatenate([weights, head_only])

    # The app gives a body with `upperTwist` a twist bone of each upper arm, so the corrective
    # shapes take it too.
    upper_share = config.get('upperTwist', {}).get('share')
    twist_weights = (weights_all if upper_share is None else
                     upper_twist(weights_all, bind_all, bind_heads))
    back_turns = clip_turns(turns, bind_heads)
    moves, det, worst = correctives(src_all, bind_all, twist_weights, back_turns, long_heads,
                                    bind_heads, upper_share)
    log(f'corrective: the smallest determinant of the skin is {det:.4f} at the vertex {worst}')
    clip = [move(back_turns[n], bind_heads[n], long_heads[n]) for n in BONES]
    if upper_share is not None:
        clip += twist_matrices(back_turns, bind_heads, long_heads, upper_share)
    back = skin(twist_weights, clip, bind_all + moves)
    error = np.linalg.norm(back - src_all, axis=1).max()
    log(f'corrective: the clip gives the source back within {error:.2e} u '
        f'({error * meters * 1000:.4f} mm)')
    shapes = split_shapes(moves, weights_all, bind_all)
    raised = []
    earlier = []
    for rule, target in raise_rules(config):
        side = rule['side']
        sheet = long_heads[f'forearm_{side}'] - long_heads[f'upper_arm_{side}']
        shape, down_weight, before, after, rounds, count = raise_shape(
            rule, bind_all, tris_all, twist_weights, bind_heads, shapes[f'arm_down_{side}'],
            sheet, earlier, upper_share, src_all)
        if 'spread' in rule:
            shape, seeds = spread_shape(shape, src_all, tris_all, rule['spread'])
            log(f'raise {target}: the move of the vertices {seeds} spreads over '
                f"{rule['spread']['rings']} rings, the bind places "
                f'{[[round(float(x), 4) for x in bind_all[v]] for v in seeds]} u')
        shapes[target] = shape
        earlier.append((rule, shape))
        key = RAISE_KEYS[rule.get('bone')]
        entry = {'side': side, 'turn': [round(float(x), 6) + 0.0
                                        for x in unit(rule['turns'][key])],
                 'fade': [float(x) for x in rule['fade']]}
        if key != 'upper_arm':
            entry['bone'] = key
        if isinstance(config['raise'], list):
            entry['target'] = target
        raised.append(entry)
        faces = module_faces(np.arange(len(tris_all)), materials)
        log(f'raise {target}: the arm-down shape has the weight {down_weight:.3f} in the pose, '
            f'{len(before)} faces turn over before and {len(after)} after {rounds} rounds of '
            f'relaxing, {count} vertices move (faces of the module before '
            f'{faces[before].tolist()}, after {faces[after].tolist()})')
    sit_clip = None
    if 'sitPose' in config:
        found, sit_rel, sit_all, error = sit_shapes(sit_mesh, sit_turns, sit_heads, bind_all,
                                                    twist_weights, turns, bind_heads,
                                                    upper_share)
        shapes.update(found)
        log(f'sit shapes: the clip sit gives the sit mesh back within {error:.2e} u '
            f'({error * meters * 1000:.4f} mm)')
        sit_clip = ({n: sit_rel[n] @ bind_frames[n] for n in BONES}, sit_heads)
    for name, shape in shapes.items():
        log(f'shape {name}: {int((np.abs(shape).max(axis=1) > 1e-6).sum())} vertices, '
            f'largest move {np.abs(shape).max():.4f} u')

    # The seat of a body with a sit pose is under the sit mesh, so that `pnpm studio-body` fits the
    # seat of the app to the seated body (`StudioBody.sitting`).
    seat_rule = config['sitPose']['chair'] if sit_clip else config['chair']
    chair = chair_mesh(seat_rule, sit_all if sit_clip else bind_all, weights_all)
    log(f'chair: seat top {chair[2]:.4f} u, lowest point of the body {bind_all[:, 1].min():.4f} u')
    if TAIL_TIP in BONES:
        tail = weights_all[:, [BONES.index('tail'), BONES.index(TAIL_TIP)]].sum(axis=1) > 0.5
        log(f'tail: the lowest point {bind_all[tail, 1].min() - bind_all[:, 1].min():.4f} u above '
            f'the soles, the farthest point back at z {bind_all[tail, 2].min():.4f} u, the widest '
            f'at |x| {np.abs(bind_all[tail, 0]).max():.4f} u')
    log(f'triangles: {len(tris_all)} ({int((materials == "gloss").sum())} gloss)')
    # `pnpm studio-body` measures the head height of the holds before the head factor, and moves
    # the head center of the holds with the drop of the head along the neck. It also takes back
    # the move of the head center by the smoothing.
    extras = {key: config[key] for key in ('headFactor', 'neckFactor')
              if config.get(key, 1) != 1}
    # The seat is a chair, or the piano bench of a pianist (`chair.prop`). `pnpm studio-body` puts
    # the front edge of the seat at the front edge of the seat of the app of that name.
    extras['seat'] = seat_extras(seat_rule, config['chair'].get('prop', 'chair'), chair[2])
    if skin_caps.any():
        # The app gives each corner of these faces the normal of the skin at its vertex
        # (`studioNormals()`), because the normals of the caps of the arm point into the gap
        # between the arm and the trunk, away from the light. The faces are fur, so their indices
        # in the module are their indices in the primitive `fur`.
        found = np.nonzero(skin_caps)[0]
        if (materials[np.argsort(order)][found] != 'fur').any():
            raise SystemExit('A cap of the arm is not fur.')
        extras['caps'] = sorted(int(t) for t in module_faces(order, materials)[found])
        log(f'caps: {len(found)} caps of the cut take the normals of the skin in the app')
    if rim.any():
        # The app gives each corner of these skin faces the normal of the skin at its vertex with
        # no crease angle (`studioNormals()`).
        found = np.nonzero(rim)[0]
        if (materials[np.argsort(order)][found] != 'fur').any():
            raise SystemExit('A face of the rim of the cut is not fur.')
        extras['rim'] = sorted(int(t) for t in module_faces(order, materials)[found])
        log(f'rim: {len(found)} skin faces around the caps of the body, the shoulder joints, the '
            f'elbow joints, the wrist joints, or at the knee joints take the normals of the skin '
            f'in the app')
    if raised:
        # A config whose `raise` is one rule writes one pose, and a list of rules writes a list.
        extras['raise'] = raised if isinstance(config['raise'], list) else raised[0]
    if upper_share is not None:
        # `pnpm studio-body` writes the share into the body, and the app gives the body the twist
        # bones of the upper arms (`StudioBody.upperTwist`).
        extras['upperTwist'] = float(upper_share)
        log(f'upper twist: the twist bone of each upper arm takes {upper_share} of its roll')
    if hinges is not None:
        # `pnpm studio-body` writes the elbow axes into the body (`StudioBody.hinges`).
        extras['hinges'] = {side: [round(float(x), 6) + 0.0 for x in axis]
                            for side, axis in hinges.items()}
        log(f"hinges: the bind arms are straight, and the elbows turn about the axes "
            f"L {extras['hinges']['L']} and R {extras['hinges']['R']}")
    if trunk:
        # `pnpm studio-body` takes the scale of the standing shoulders from the clip `reference`
        # of a rig whose trunk reclines in the seated bind pose.
        extras['trunk'] = round(float(trunk), 6)
    if 'smooth' in config:
        shift = head_shift(unsmoothed, verts, weights_all, tris_all, materials)
        extras['headShift'] = [round(float(x), 6) + 0.0 for x in shift]
        log(f'smooth: the head center of the holds moves back by {np.linalg.norm(shift):.4f} u '
            f'({np.linalg.norm(shift) * meters * 100:.2f} cm), to the head before the smoothing')
    write_glb(out_path, config, bind_all, tris_all, colors_all, materials, weights_all, shapes,
              bind_frames, bind_heads, src_frames, long_heads, extras,
              base_all if (base_all != colors_all).any() else None, sit_clip)

    if obj_path:
        write_obj(obj_path, long_verts, tris)
    if preview_dir:
        os.makedirs(preview_dir, exist_ok=True)
        write_obj(os.path.join(preview_dir, 'source-long-arms.obj'), long_verts, tris)
        main_bone = weights_all[tris_all].sum(axis=1).argmax(axis=1)
        bones = np.array([bone_color(k) for k in main_bone])
        chair_part = (chair[0], chair[1], np.tile(CHAIR_COLOR, (len(chair[1]), 1)))
        four = [('front', 0, 5), ('right', 90, 5), ('back', 180, 5), ('q', 35, 15)]
        # The views grow with the body: 1 unit high with no factor of the legs or the head.
        tall = float(src_all[:, 1].max())
        seated_center = np.array([0, 0.5 * tall, 0.02])
        standing_center = np.array([0, 0.5 * tall, 0])
        low = np.array([0, 0.25 + rise, -0.15])
        knees = np.array([0, 0.17 + rise, 0.02])
        # The neck views keep the shoulders in place, so that the views of two neck factors
        # compare.
        shoulders = bind_heads['upper_arm_L']
        neck_seated = np.array([0, shoulders[1] + 0.12, bind_heads['neck'][2] + 0.05])
        neck_standing = np.array([0, long_heads['upper_arm_L'][1] + 0.12,
                                  long_heads['neck'][2] + 0.05])
        neck_views = [('right', 90, 0), ('front', 0, 0), ('q', 35, 10), ('back', 180, 0)]
        # A body with a sit pose also shows the sit mesh on its chair, and its knees.
        sitting = [] if sit_clip is None else [
            ('sitting', [(sit_all, tris_all, colors_all), chair_part],
             [(v, a, e, seated_center, 1.1 * tall) for v, a, e in four]),
            ('sitting-knees', [(sit_all, tris_all, colors_all), chair_part],
             [('right', 90, 0, knees, 0.4 + rise), ('left', 270, 0, knees, 0.4 + rise),
              ('front', 0, 10, knees, 0.4 + rise)]),
        ]
        preview(preview_dir, sitting + [
            ('seated', [(bind_all, tris_all, colors_all), chair_part],
             [(v, a, e, seated_center, 1.1 * tall) for v, a, e in four]),
            ('standing', [(src_all, tris_all, colors_all)],
             [(v, a, e, standing_center, 1.1 * tall) for v, a, e in four]),
            ('tail', [(bind_all, tris_all, colors_all), chair_part],
             [('right', 90, 0, low, 0.7 + rise), ('back', 180, 10, low, 0.7 + rise)]),
            ('tail-bones', [(bind_all, tris_all, bones), chair_part],
             [('right', 90, 0, low, 0.7 + rise), ('back', 180, 10, low, 0.7 + rise)]),
            ('knees', [(bind_all, tris_all, colors_all), chair_part],
             [('right', 90, 0, knees, 0.4 + rise),
              ('left', 270, 0, knees, 0.4 + rise),
              ('front', 0, 10, knees, 0.4 + rise)]),
            ('neck', [(bind_all, tris_all, colors_all), chair_part],
             [(v, a, e, neck_seated, 0.6) for v, a, e in neck_views]),
            ('neck-standing', [(src_all, tris_all, colors_all)],
             [(v, a, e, neck_standing, 0.6) for v, a, e in neck_views]),
            ('bones', [(bind_all, tris_all, bones)],
             [(v, a, e, seated_center, 1.1 * tall) for v, a, e in four]),
            ('bones-standing', [(src_all, tris_all, bones)],
             [(v, a, e, standing_center, 1.1 * tall) for v, a, e in four]),
        ])


main()
