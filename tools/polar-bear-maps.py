# Writes the web color map and the web normal map of the Tripo polar bear from the maps of its FBX
# (design 4.5, assets/models/polar-bear/README.md, "Color map" and "Normal map"). The color map
# scales the source image to 2048 pixels and moves each texel in Oklab. The tan fur of the source
# goes to the white of the main polar bear in the hall light, and it keeps its strands as small
# steps of the lightness. The dark pads and mouth line keep their lightness, and the nose and the
# claws turn as dark as the nose and the black claws of the main polar bear. The texels of the
# eyeballs keep the eye paint of the source, with each iris moved to the middle of its opening in
# the view of the play (`EYE_PAINT`, "Eyes" of the README). The script reads the triangles, the
# places, and the texture points of the eyeballs (`ownEyes` of the export) and of the claws (the
# loose parts of CLAW_PARTS positions) from the rig file. The normal map limits each tilt of the
# source, scales it to 1024 pixels, and stores the tilts times NORMAL_MAP_GAIN of src/scene/fur.ts.
# The output depends only on the input files and on cwebp 1.5.0.
#
# Usage: uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I
#   tools/polar-bear-maps.py
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gaze_shift  # noqa: E402
from fur_maps import (  # noqa: E402
    SIZE, linear, linear_of_oklab, normal_map, oklab, smoothstep, srgb8,
)

SOURCE = 'assets/models/polar-bear/tripo-p2/polar-bear.fbm/polar-bear_basecolor.jpg'
NORMAL_SOURCE = 'assets/models/polar-bear/tripo-p2/polar-bear.fbm/polar-bear_normal.jpg'
RIG = 'assets/models/polar-bear/tripo-hand/polar-bear.rig.glb'
COLOR_OUT = 'assets/models/polar-bear/tripo-hand/polar-bear-color.webp'
NORMAL_OUT = 'assets/models/polar-bear/tripo-hand/polar-bear-normal.webp'
QUALITY = 60

#: The Oklab lightness, chroma, and hue (degrees) of the tan fur of the source map: the median
#: of the texels with a lightness above 0.72.
SOURCE_FUR = (0.841, 0.069, 74.3)
#: The Oklab lightness, chroma, and hue (degrees) that the fur of the source takes.
FUR = (0.92, 0.015, 85.0)
#: The share of the lightness steps of the fur strands around SOURCE_FUR that the fur keeps.
STRANDS = 0.7
#: The share of the chroma steps of the fur around SOURCE_FUR that the fur keeps.
CHROMA_STEPS = 0.3
#: The Oklab lightness below which a texel keeps its lightness (the nose, the claws, the pads,
#: and the mouth line), and the lightness above which it is fur. A texel between them takes a
#: smooth mix of the two moves.
DARK = (0.55, 0.72)
#: The share of its chroma that a dark texel keeps, so that the brown pads and lines read dark
#: gray as on a polar bear.
DARK_CHROMA = 0.6
#: The texels of the eyeballs and this many texels around them keep their colors.
EYE_MARGIN = 4
#: The Oklab lightness, chroma, and hue (degrees) of the claws. The source paints the claws brown
#: with light tips (median L 0.635), which read pale gray beside the black claws of the main polar
#: bear (SPECIES_COLORS accent #1a1715).
CLAW = (0.25, 0.012, 60.0)
#: The share of the lightness steps of the claw texels around their median that the claws keep.
CLAW_STEPS = 0.25
#: The smallest and the largest count of positions of a loose part that is a claw: the claws of
#: the Tripo mesh have 28 or 29 vertices, and the eyeballs and the lids more than 40.
CLAW_PARTS = (25, 40)
#: The texels around the claw triangles that take the claw color too.
CLAW_MARGIN = 2
#: The box of the nose in the places of the rig file (the seated bind): a triangle with its three
#: corners in the box is a nose triangle. The nose takes the color map with the smooth normals of
#: the fur. As flat gloss faces, it showed a light square in the key light.
NOSE_BOX = ((-0.03, 0.834, 0.187), (0.03, 0.887, 0.217))
#: The Oklab lightness, chroma, and hue (degrees) of the nose. The painted nose of the source
#: (median Oklab L 0.336 of its dark texels) read brown in the hall light beside the near black nose of the main polar bear.
NOSE = (0.22, 0.012, 55.0)
#: The share of the lightness steps of the nose texels around their median that the nose keeps,
#: so that the nostrils of the source still show.
NOSE_STEPS = 0.5
#: The paint of the eyeballs. 'source' keeps the eye of the source map: a black pupil in a brown
#: iris with a painted white light, and white at the outer corner. 'centered' keeps the same paint,
#: and moves the iris with its pupil and its light to the middle of the eye opening of the view of
#: the play (`gaze_shift.shift_gaze()`).
EYE_PAINT = 'centered'
#: True when the source map paints a dark lash line in the cells at the edge of the opening
#: (`EDGE_CELLS` of tools/gaze_shift.py): then the dark texels of these cells stay at the old
#: place of the iris. With False, the old place of the iris takes white up to the edge.
LASH_LINE = True
#: The view of the play, in which each iris lies in the middle of its opening
#: (`gaze_shift.gaze_targets()`): the head of the pianist turns down by PLAY_HEAD_PITCH degrees
#: in the play moments (`pnpm pose-preview pianist`: chord, between, far-left, far-right), and the
#: camera of the test page looks down at the eyes by PLAY_CAMERA_ELEVATION degrees. So the camera
#: lies above the forward axis of the head by the sum.
PLAY_HEAD_PITCH = 5.2
PLAY_CAMERA_ELEVATION = 0.3
#: The turn in degrees of each iris target out and up from the middle of the opening in the play
#: view. A small turn out stops a cross-eyed look.
GAZE_OUT = 6.0
GAZE_UP = 5.0
#: The tone of the eyes for the far view of the hall (`far_tone()`), with the values of
#: `far_eyes()` of the Tripo fox and rabbit for a dark iris (the brown iris of the bear has the
#: median Oklab L 0.39). There each eye is a few pixels across, and the bright white around the
#: iris read dim and as a side glance. The source paints white only at the outer corner, so the
#: round iris of `far_eyes()` finds both edges of the iris in too few directions, and this step
#: only tones the paint. IRIS_SHADE scales the Oklab lightness of the iris, SCLERA_SHADE the
#: lightness of the white, and SCLERA_WARM is the Oklab (a, b) step of the white to a warm
#: ivory. A texel goes from iris to white by a soft step of its luma (WHITE_LUMA, sRGB) and of its
#: saturation (WHITE_SATURATION). The painted light is a gray white (luma 180 to 226, as the
#: white), so it takes the tone of the white.
IRIS_SHADE = 0.9
SCLERA_SHADE = 0.85
SCLERA_WARM = (0.008, 0.03)
WHITE_LUMA = (90.0, 170.0)
WHITE_SATURATION = (0.2, 0.4)
#: The brows (`soften_brows()`). The source paints a gray brown brow over each eye on the body
#: faces, and in the hall view it read as a dark band over the eye. A brow face is a face of the
#: body with each corner within BROW_REACH ball radii of the middle of a ball, a corner past
#: SOCKET_REACH (so that the lash line of the socket stays), and its middle more than BROW_ABOVE
#: ball radii above that middle. Its texels keep BROW_CONTRAST of their step from the fur color of
#: the side: the median texel of the body faces from BROW_REACH to FUR_REACH ball radii.
BROW_REACH = 3.4
SOCKET_REACH = 1.5
BROW_ABOVE = 0.3
FUR_REACH = 4.4
BROW_CONTRAST = 0.5
#: The texels around the brow triangles that also soften, so that the bilinear texture sample at
#: the edge of a triangle takes no old dark color.
SOFT_MARGIN = 2


def claw_mask(rig, size):
    """Gives the texels of the claw triangles of the rig file (the loose parts with a count of
    positions in CLAW_PARTS), grown by CLAW_MARGIN texels, and the count of claws."""
    triangles, positions, points, _ = rig
    _, weld = np.unique(np.round(positions.astype(np.float64), 6), axis=0, return_inverse=True)
    weld = weld.ravel()
    parent = np.arange(weld.max() + 1)

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for t in triangles:
        a, b, c = (find(weld[i]) for i in t)
        parent[b] = a
        parent[find(c)] = a
    roots = np.array([find(i) for i in range(len(parent))])
    sizes = np.bincount(roots)
    part = roots[weld[triangles[:, 0]]]
    claws = (sizes[part] >= CLAW_PARTS[0]) & (sizes[part] <= CLAW_PARTS[1])
    mask = gaze_shift.draw_triangles(triangles, points, np.flatnonzero(claws), size)
    mask = mask.filter(ImageFilter.MaxFilter(2 * CLAW_MARGIN + 1))
    return np.asarray(mask) > 0, len(set(part[claws].tolist()))


def nose_mask(rig, size):
    """Gives the texels of the nose triangles of the rig file (NOSE_BOX), grown by CLAW_MARGIN
    texels, and the count of the triangles."""
    triangles, positions, points, _ = rig
    low, high = (np.array(corner) for corner in NOSE_BOX)
    inside = np.all((positions >= low) & (positions <= high), axis=1)
    faces = np.flatnonzero(inside[triangles].all(axis=1))
    mask = gaze_shift.draw_triangles(triangles, points, faces, size)
    mask = mask.filter(ImageFilter.MaxFilter(2 * CLAW_MARGIN + 1))
    return np.asarray(mask) > 0, len(faces)


def lch(lightness, chroma, hue):
    h = np.radians(hue)
    return np.array([lightness, chroma * np.cos(h), chroma * np.sin(h)])


def white_fur(lab):
    """Moves each texel in Oklab: the fur to FUR with its strand steps, a dark texel to less
    chroma at its own lightness, and a mix of both between the DARK limits."""
    source = lch(*SOURCE_FUR)
    target = lch(*FUR)
    lightness = lab[..., 0]
    chroma = np.hypot(lab[..., 1], lab[..., 2])
    # The fur keeps a share of its own steps of lightness and chroma around the fur of the source,
    # with the hue of the target.
    fur = np.empty_like(lab)
    fur[..., 0] = target[0] + STRANDS * (lightness - source[0])
    fur_chroma = np.maximum(0.0, FUR[1] + CHROMA_STEPS * (chroma - SOURCE_FUR[1]))
    hue = np.radians(FUR[2])
    fur[..., 1] = fur_chroma * np.cos(hue)
    fur[..., 2] = fur_chroma * np.sin(hue)
    dark = lab.copy()
    dark[..., 1:] *= DARK_CHROMA
    share = smoothstep(*DARK, lightness)[..., None]
    return dark + share * (fur - dark)


def far_tone(rig, image):
    """Gives the image with the tone of the eyes for the far view (IRIS_SHADE, SCLERA_SHADE): each
    texel of an eyeball moves in Oklab by its white share w, the soft step of its luma times one
    less the soft step of its saturation. The lightness takes the factor IRIS_SHADE (1 - w) +
    SCLERA_SHADE w, and the white also takes w times the step SCLERA_WARM."""
    out = np.asarray(image).astype(np.float64)
    _, taken = gaze_shift.ball_texels(rig, SIZE)
    colors = out[taken]
    luma = colors @ [0.2126, 0.7152, 0.0722]
    top, low = colors.max(axis=1), colors.min(axis=1)
    saturation = (top - low) / np.maximum(top, 1)
    w = smoothstep(*WHITE_LUMA, luma) * (1 - smoothstep(*WHITE_SATURATION, saturation))
    lab = oklab(linear(colors))
    lab[:, 0] *= IRIS_SHADE * (1 - w) + SCLERA_SHADE * w
    lab[:, 1:] += w[:, None] * np.array(SCLERA_WARM)
    out[taken] = srgb8(linear_of_oklab(lab))
    print(f'far tone: {int(taken.sum())} ball texels, mean white share {w.mean():.2f}')
    return Image.fromarray(np.round(out).astype(np.uint8))


def soften_brows(rig, image):
    """Moves the painted brows toward the fur around them (BROW_CONTRAST), and gives the new
    image. Each texel of the brow triangles of a side, and SOFT_MARGIN texels around them but no
    eyeball texel, takes in Oklab the fur color of its side plus BROW_CONTRAST of its step from
    that color."""
    triangles, positions, points, eyes = rig[:4]
    out = np.asarray(image).copy()
    lab = oklab(linear(out))
    ball_faces = [f for side in ('L', 'R') for f in eyes[side]['faces']]
    balls = np.asarray(gaze_shift.draw_triangles(triangles, points, ball_faces, SIZE)) > 0
    body = np.ones(len(triangles), bool)
    body[ball_faces] = False
    corners = positions[triangles]
    for side in ('L', 'R'):
        c, r, _ = gaze_shift.ball_frame(rig, np.array(eyes[side]['faces']))
        reach = np.linalg.norm(corners - c, axis=2) / r
        above = (corners.mean(axis=1)[:, 1] - c[1]) / r
        brows = np.flatnonzero(body & (reach.max(axis=1) < BROW_REACH)
                               & (reach.max(axis=1) >= SOCKET_REACH) & (above > BROW_ABOVE))
        ring = np.flatnonzero(body & (reach.min(axis=1) >= BROW_REACH)
                              & (reach.max(axis=1) < FUR_REACH))
        ring_texels = np.asarray(gaze_shift.draw_triangles(triangles, points, ring, SIZE)) > 0
        fur = np.median(lab[ring_texels & ~balls], axis=0)
        mask = np.asarray(gaze_shift.draw_triangles(triangles, points, brows, SIZE)
                          .filter(ImageFilter.MaxFilter(2 * SOFT_MARGIN + 1))) > 0
        mask &= ~balls
        step = np.abs(lab[mask][:, 0] - fur[0])
        out[mask] = srgb8(linear_of_oklab(fur + BROW_CONTRAST * (lab[mask] - fur)))
        print(f'brow {side}: {len(brows)} faces, {int(mask.sum())} texels; fur Oklab L {fur[0]:.3f}; '
              f'the mean lightness step to the fur goes from {step.mean():.3f} to '
              f'{BROW_CONTRAST * step.mean():.3f}')
    return Image.fromarray(out)


def color_map(rig):
    image = Image.open(SOURCE).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
    if EYE_PAINT == 'centered':
        image = gaze_shift.shift_gaze(
            rig, image, PLAY_HEAD_PITCH + PLAY_CAMERA_ELEVATION, GAZE_OUT, GAZE_UP, LASH_LINE
        )
    image = far_tone(rig, image)
    image = soften_brows(rig, image)
    lab = oklab(linear(np.asarray(image)))
    moved = white_fur(lab)
    claws, claw_count = claw_mask(rig, SIZE)
    median = np.median(lab[claws][:, 0])
    moved[claws] = lch(*CLAW)
    moved[claws, 0] += CLAW_STEPS * (lab[claws][:, 0] - median)
    # The dark texels of the nose take the nose color, and a texel between dark and fur takes a
    # smooth mix, so that the fur of the muzzle around the nose stays.
    nose, nose_count = nose_mask(rig, SIZE)
    dark = 1 - smoothstep(*DARK, lab[nose][:, 0])
    tone = np.tile(lch(*NOSE), (int(nose.sum()), 1))
    tone[:, 0] += NOSE_STEPS * (lab[nose][:, 0] - np.median(lab[nose][dark > 0.5][:, 0]))
    moved[nose] += dark[:, None] * (tone - moved[nose])
    eyes = gaze_shift.eye_mask(rig, SIZE, EYE_MARGIN)
    count = len(rig[3]['L']['faces']) + len(rig[3]['R']['faces'])
    moved[eyes] = lab[eyes]
    out = srgb8(linear_of_oklab(moved))
    Image.fromarray(out).save(COLOR_OUT, 'WEBP', quality=QUALITY, method=6)
    print(f'{COLOR_OUT}: {SIZE} x {SIZE}, {count} eye triangles kept ({int(eyes.sum())} texels), '
          f'{claw_count} claws ({int(claws.sum())} texels), {nose_count} nose triangles '
          f'({int(nose.sum())} texels), {os.path.getsize(COLOR_OUT)} bytes')


def main():
    which = sys.argv[1:] or ['color', 'normal']
    if 'color' in which:
        color_map(gaze_shift.read_rig(RIG))
    if 'normal' in which:
        a = normal_map(NORMAL_SOURCE, NORMAL_OUT)
        print(f'{NORMAL_OUT}: {int((a[..., 2] < 0).sum())} texels with z below 0')


if __name__ == '__main__':
    main()
