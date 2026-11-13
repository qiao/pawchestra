# Fox model

This folder holds the Tripo P2 source mesh of the fox (`tripo-p2/`) and its hand rig
(`tripo-hand/`). The red fox and the tan fox share the rig. The app does not serve these files. It
loads the module `src/models/studio/fox.ts`, which this chain writes:

```text
tripo-p2/fox.fbx             source mesh with quad faces
   │  pnpm hand-chain fox    chain tools/blender/hand/fox/
   v
tripo-hand/fox.blend         hand rig (design 4.4, "Hand rig")
   │  pnpm rig-export fox    the same run
   v
tripo-hand/fox.rig.glb       rigged mesh, with its summary fox.rig.json
   │  pnpm studio-body fox   the same run
   v
src/models/studio/fox.ts     studio body of the app
```

`tools/blender/hand/README.md` gives the steps of the chain. The section "Tripo hand rig" below
gives the files, their sources, their licenses, and their checksums.

The files of the older bodies are removed. Commit `cbc8db5e4` has the files of the route of
`pnpm rig-mesh`, and commit `62bf447f4` has the third Tripo P2 fox with its four-digit paws
(`tripo-p2/fox-paws.fbx`, `tools/blender/fox_paws.py`) and the sections of this file about them.

## Tripo hand rig

`tripo-hand/` holds the body of the red fox and the tan fox ("tripo-hand/fox.blend" below): a hand
rig of the Tripo P2 mesh `tripo-p2/fox.fbx`, made in headless Blender by the route of the Tripo
wolf: the form, the colors, and the eye paint of the source, with no arm cut. The `ANIMALS` entry
of the fox points to `tripo-hand/fox.rig.glb`. The red fox and the tan fox share it.

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/fox.fbx`, `tripo-p2/fox.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |
| `tripo-hand/fox.blend` | Made in headless Blender 5.2 from `tripo-p2/fox.fbx` (below). License as the FBX file | `pnpm hand-chain fox` |
| `tripo-hand/fox.rig.glb` | Export of `tripo-hand/fox.blend`. License as the FBX file | `pnpm rig-export fox --blend assets/models/fox/tripo-hand/fox.blend --out assets/models/fox/tripo-hand/fox.rig.glb` |
| `tripo-hand/fox.rig.json` | Text summary of the export, for diffs | The same run |
| `tripo-hand/fox-color.webp` | Color map of the red fox, from the color map of the Tripo FBX ("Color map" below). License as the FBX file | `uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/fox-maps.py` |
| `tripo-hand/fox-tan-color.webp` | Color map of the tan fox ("Tan color map" below). License as the FBX file | The same run |
| `tripo-hand/fox-normal.webp` | Normal map of the fur of the red fox and the tan fox ("Normal map" below). License as the FBX file | The same run (cwebp 1.5.0) |

### tripo-p2/fox.fbx

A furry red fox in a T-pose with quad faces, made with Tripo P2 from the turnaround sheet
`fox4.png` of the project author: dark socks to the elbows and the knees, small dark paws, a cream
bib, muzzle, and tail tip, dark ear backs, soft brows, and a smile. It replaces the Tripo fox of
`62bf447f4` ("History" below).

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan, and given on 2026-11-13. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary. The maps lie beside the FBX file in the zip file |
| Contents | One mesh object, with no armature and no animation. 3,137 vertices and 3,381 faces: 2,842 quads and 539 triangles (6,223 triangles in all), no n-gon. One UV layer |
| Parts | 3 parts: the body with the tail (3,047 vertices), and two flat eye domes of 45 vertices each (a pole and two rings of 22, with an open rim). No vertices merge at 1e-5. 47 open edges: the 2 dome rims and a slit of 3 edges at the crotch. 4 edges of more than two faces at the crotch |
| Axes | The fox faces -y of Blender, so the import takes no turn. 1 unit from the soles to the ear tips, x -0.332 to 0.364 (the paw tips), and z ±0.254 (the snout and the tail) |
| Form | The source is not a mirror: the left forearm is longer by about 0.028 units in one quad band before the paw, the left foot stands 0.024 units farther out, and the right ear 0.026 units farther out (largest mirror gap 0.032 units) |

The folder `fox.fbm/` keeps two maps of the zip file under new names, as bytes. The roughness and
the metallic maps are not kept.

| File | Name in the zip file | Size | Pixels | SHA-256 |
|---|---|---|---|---|
| `fox.fbx` | `tripo_convert_f55d1bfa-1c15-4638-b9b7-7fcd9404c2e0.fbx` | 209,180 bytes | | `a3b5ff60c87fc2c73f02ea5840121102bc7e69902e1efccbafb86e30be28198d` |
| `fox.fbm/fox_basecolor.jpg` | `tripo_rgb_622a2e07-c7b9-4da3-89de-1daebbbfa6b4.jpg` | 2,603,490 bytes | 4096 × 4096 | `bc4c9738cc24154e267ab588269f7a05e5fbf46a706fc0948f980c4db22140eb` |
| `fox.fbm/fox_normal.jpg` | `tripo_normal_a8ea875d-72a7-4197-9007-0e0e24e0ef59.jpg` | 968,902 bytes | 4096 × 4096 | `f5df577547ceb78c792e03ab9ae16810a9ba0cb1878f8d333e6a824e549456e4` |

The color map paints on each eye dome a dark brown iris, a black pupil with a white light, and a
little white. It also paints soft brows, a black nose, a smile line, and the colors of the sheet.

### tripo-hand/fox.blend

The hand rig (design 4.4, "Hand rig"), made in headless Blender 5.2 (`blender -b --factory-startup`)
by one build script, as the Tripo wolf (`../wolf/README.md`). The chain of the body is in
`tools/blender/hand/fox/` (`build.py`, `make_config.py`, `params.json`, `base-config.json`,
`redits.py`, `rimport.py`, `rings.py`, `tail.py`), and `pnpm hand-chain fox` runs it
(`tools/blender/hand/README.md`). `make_config.py` writes `tools/mesh-rigs/simple/fox-tripo.json`:
the joints of the source, mapped by the point edits.

| Item | Value |
|---|---|
| Size | 380,605 bytes. A new build gives the same export, but not the same `.blend` bytes |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the ear tips, the soles at z = 0, the fox faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `fox`: 3,613 vertices and 3,805 faces (3,266 quads and 539 triangles, 7,071 triangles). Flat faces and the surface of `sa.add_surface()`. No face is gloss: the nose takes the slot `fur` and the color map. The 88 faces of the two eye domes have the face attribute `eye`, and the 312 faces of the two lids the face attribute `lid`. The UV map of the FBX, and the property `texture` (`assets/models/fox/tripo-hand/fox-color.webp`) |
| Armature | `fox_rig`: the 30 body bones, `tail_tip`, and the 20 arm segments and helpers, at the joints of the config. The legs and the right ear have joints of their own. The Action `bind` holds the seated bind with no bind supination. The properties `palm`, `hinges`, `seat`, and `lids` come from the steps below |
| Facts | `height` 1.058222 (the shoulder joints at 1.69045 m for each unit), `crease` 180 |
| Eyes | The eye domes of the mesh, each on its own sphere, with the finish `varnish` and no eye light (`eyeFinish` of the entry), and a blink lid on each. No eye objects, so the app adds no bead eyes |

The edits, in the order of the build (`sa` is `tools/blender/studio_armature.py`, x is the x of the
left side, y the height, in the source). Each edit is a need of the rig, the seat, the eyes, or the
instruments:

- **Import.** `sa.import_source('assets/models/fox/tripo-p2/fox.fbx', 1e-5)`. No vertex merges,
  and each face is flat.
- **Arm rings.** Edge ring Subdivide (`bmesh.ops.subdivide_edges(bm, edges=<ring>, cuts=<n>,
  use_grid_fill=True)`) of the clean quad bands of 14 edges between the closed arm loops at x
  0.153, 0.1735, and 0.1965 (1 cut on each band), and of the long band of 14 quads past the loop
  at x 0.1965 to the paw (2 cuts, `open_band()`): its far row has poles, so it is no closed loop,
  but the ring of its 14 edges is clean. A ring then stands about each 0.3 to 0.4 arm radii from
  x 0.153 to the wrist.
- **Rings with no split.** The arm root to x 0.153 stops at poles and triangles. The closed leg
  loops of 12 vertices (y 0.067 to 0.257) take no split, because the knee bends over 3 of them.
- **Paws turned.** Each vertex past the arm ring at x 0.2105 turns rigidly about the rest forearm
  axis by whole ring steps of 360/14 degrees: 180 degrees on the left (7 steps) and 102.9 degrees
  on the right (4 steps). The turned part is each vertex that the edges join to the next ring with
  no step through the ring at x 0.2105. New quads join the two rings with the step offset, the far ring takes the
  form of the ring before the turn (a fade to 0 at 0.02 units), and the 28 new quads take the
  planar UVs of the dark sock patch at UV (0.8786, 0.7657) ("Arm twist").
- **Even arms.** The edit `armEven` moves each point of the left arm past x 0.199 in by s(x): 0 at
  x 0.199, 0.001 at 0.235, 0.023 at 0.262, 0.027 at 0.30, and 0.03 at 0.37, linear between ("Even
  arms").
- **Longer arms.** The edit `armStretch` makes the upper arms and the forearms 1.25 times longer
  along the line of the rest arm (ramp 0.01 units at the shoulder and the wrist), and the paw moves
  as one piece. The share fades from 0.065 to 0.085 units from the arm line, so the trunk and the
  head stay ("Arm length").
- **Paw size.** After the automatic weights, the edit `paw` scales each fore paw past the wrist
  joint in the frame of the paw: 0.72 along the forearm axis, 0.66 in width, and 0.9 in height,
  with a ramp of 0.02 units ("Paw size").
- **Eye domes.** Each dome vertex moves onto the sphere of its dome (`ballSphere` 1.0, radius
  0.0520 on the left and 0.0563 on the right). The source domes lie from 0.957 to 1.093 sphere
  radii from the middle ("Eyes").
- **Other point edits.** None. The head, the muzzle, the trunk, the legs, the feet, and the tail
  keep the form of the source.
- **Surface.** `sa.add_surface(fox, 'fox', <base color>, eye_fans=False, config=<fox-tripo.json>)`.
  The 35 gloss faces of the nose box go back to the slot `fur`, so the nose takes the color map
  with its painted nostrils.
- **Armature.** The joints of the config, on the mirror of the right arm: the shoulder at x 0.09,
  the elbow at x 0.168, the wrist at x 0.238, and the knuckles at x 0.295, mapped by the arm
  stretch. The hip joints at (0.07, 0.30, 0.066) on the left and (-0.06, 0.30, 0.066) on the
  right, the knees at y 0.165, and the ankles at y 0.067, on the middles of the leg loops of each
  side. The hips joint lies at z 0.055: at z 0.05 the float error of the frame of `thigh_L` under
  `hips` (1.8e-5) passed the frame limit of the export (1e-5). The palm is the down normal of the
  source paw, turned by the paw turn. The property `hinges` holds the elbow axis of each side,
  turned about its bind upper arm by 15 degrees on the left and -40 degrees on the right ("Arm
  twist").

The weights, in the rest pose:

1. Automatic Weights, then Limit Total 4 and Normalize All, on a copy of the mesh with no loose
   part and no face on an edge of more than two faces.
2. Arm rows: each vertex of a side with |x| from 0.09, within 0.055 units of the line of the rest
   arm, takes one exact row (`sa.set_weight_row()`): a clavicle share of 0.6, 0.48, 0.36, 0.25,
   0.15, and 0.07 at the source x 0.09, 0.10, 0.11, 0.12, 0.13, and 0.14, linear between them and
   0 from x 0.15, an elbow helper share that grows from 0 at x 0.13 to 1 at the elbow joint (x 0.168) and falls
   to 0 at x 0.1965, and the rest on the 4 roll segments ("Arm roots"). The rows take x of the
   source, mapped back through the arm stretch (`arm_source_x()`).
3. Wrist rows: the bend share of the paw grows in 12 equal steps of 0.003 from 0.03 units before
   the head of `hand_<side>`. Knuckle rows: the fingers share grows in 12 equal steps of 0.003 from
   0.017 units before the head of `fingers_<side>`.
4. The eye domes and the nose take {`head` 1}.
5. Ear rows: a plane across the base of each ear, through (0.035, 0.905, 0.05), (0.13, 0.86,
   0.05), (0.085, 0.882, 0), and (0.085, 0.882, 0.10) (x mirrored on the right). Each head vertex
   above the plane by 0.008 or more takes {`ear_<side>` 1}, one from 0 to 0.008 {`ear_<side>` 0.5,
   `head` 0.5}, and each other vertex gives its ear share to `head`.

**Smooth surface.** No relax and no region colors: the basis keeps the form of the source. The
crease angle 180 gives each corner the mean normal of the faces at its vertex, as the smooth
shading of an FBX viewer.

**Scale.** A replacing body keeps the eye height of the old body, so that the seat search keeps
its input (design 4.2). The seated eye bone of the fox of `62bf447f4` stands 1.2313 m high. At
1.77592 m for each unit, the new body had it at 1.2935 m, so the scale is 1.77592 × 1.2313 / 1.2935
= 1.69045 m for each unit, and the eye stands at 1.2313 m. H is 0.348 m (0.380 m before), and the
seated crown 1.535 m (1.609 m).

**Seat.** The thighs slope 15 degrees down and 8 degrees out in the bind, the shins lean 12
degrees forward, and the feet stay flat on the floor (`legTurns` of the config). The front of the
seat lies 0.06 units behind the knee joint of the bind, and 54 % of the thigh lies on the seat.
The half width 0.14 holds the haunch (x -0.127 to 0.134). The seat height of the app is 0.179 m
(0.249 m before), and the chair is 0.386 m deep (0.318 m). Reason: the thighs and the trunk of the
new mesh are thicker. At the waist (y 0.49) the trunk is 0.33 m wide and 0.196 units deep, against
0.25 m and 0.120 units on the fox before.

**Even arms.** The source is no mirror. The left arm matches the mirror of the right arm within
1 to 2 mm (median nearest distance) up to x 0.26, and past it the left paw stands 0.023 to 0.031
units farther out: the band from the loop at x 0.1965 to the paw is longer on the left. The edit
`armEven` takes the left paw in by that shift, so one set of joints fits both arms.

**Arm length.** The source arm reaches 0.287 m from the shoulder joint to the middle of the palm
(`pnpm hold-reach fox-red --instrument violin`), 0.82 H, against 0.380 m (1.00 H) on the fox
before, 0.98 H on the rabbit, 1.06 H on the cat, and 1.08 H on the wolf. Both flute grips lay out of
reach (by 3.5 and 4.4 cm). With the arm stretch of 1.25, the arm reaches 0.348 m (1.00 H), the
flute grips have 1.8 to 2.8 cm to spare, and the violin hand reaches 0.63 to 1.00 of the
fingerboard. The upper arm is 6.6 cm in radius at its middle loop (5.8 cm before), and the forearm
5.4 cm (4.3 to 5.2 cm).

**Paw size.** The measures of the fore paw (`pawmeasure.py` of the session, in the units of the
source, with the wrist girth of the narrowest arm section):

| Measure | Source paw | Paw now | Fox before | Tripo wolf |
|---|---|---|---|---|
| Digits | 4 and a short thumb, the middle two longest | The same | 4 | - |
| Width / wrist diameter (girth / π) | 1.91 | 1.32 | 1.29 | 1.30 |
| Length, wrist joint to tip / shoulder distance | 0.53 | 0.38 | 0.355 | 0.451 |
| Width / shoulder distance | 0.57 | 0.39 | 0.366 | 0.462 |

In the app the paw is 0.117 m long and 0.119 m wide (0.34 H), on a wrist of 0.091 m (0.086 m on
the fox before).

**Tail.** The tail is a part of the body. Its tube is each vertex past the closed root loop of 18
vertices at (0, 0.329, -0.048) on the back, and the loop itself (185 vertices). Its middle line goes
from the middle of that loop to the tip (0, 0.073, -0.231). The tube vertices take {`hips` 1 - a,
`tail` a (1 - b), `tail_tip` a b}, with a = smoothstep(-0.01, 0.03) of the place along the line and
b = smoothstep(-0.04, 0.04) about the head of `tail_tip`. The tail bones point (0, -0.5, -1) and
(0, -1, -0.1) in the bind (`studio.tailBind`): the tail goes back over the back edge of the seat and
hangs down behind the chair. In the rest of the violinist (`node tools/tail-gap.ts fox-violinist`)
the tail keeps 1.6 cm from the seat, 3.0 cm and 3.2 cm from the back posts, and 2.1 cm from the top
rail, and its tip lies on the floor (0.0 cm). The tail sways in the idle motion.

**Eyes.** Each eye of the source is a flat dome of 45 vertices with an open rim of 22 edges, in a
closed socket: the rim is 0.024 units in radius, the top of the dome stands 0.0045 units over the
rim, and the skin around it rises up to 0.02 units over the rim. The sphere of a dome is large
(0.052 and 0.056 units), so its middle lies near the middle plane of the head. The app turns each
lid about that middle (`own_eyes_of()` of `tools/blender/export_rig.py`). The eyes keep the size and
the iris place of the source: the gaze reads at the viewer, and the face reads happy with the
painted smile line. The map paints a light in each pupil, so the eyes take the finish `varnish`
and no eye light.

**Lids.** A lid on each eye: 14 × 13 points from psi -26 to 28 degrees and lam from -30 to 40
degrees on the left (the mirror on the right) at 1.04 sphere radii, and a lower strip at 1.015
radii, 156 quads on each side, held turned up 60 degrees into the head. The lid faces take the
orange fur patch at UV (0.9107, 0.4281) at 0.88 UV for each unit, and the row `head` 1. In the 21
steps of the blink, no point of the open lid leaves the head. In the last 4 steps of the closing,
3 to 7 points of the upper inner corner of the left lid stand out of the head near the brow. The
right lid stays in. With the turn 126 degrees and the radius 1.17 of the fox before, the lids
crossed the middle plane, and the side edges left the head in the middle of the blink.

**Arm twist.** The play turns of the arms (`pnpm hold-fit`, "play turns: upper arm, paw (twist,
swing)"), in degrees, against the fox of `62bf447f4`:

| Role | Arm | Before | Now |
|---|---|---|---|
| Violinist | L | 43, 39 (-38, 4) | 43, 24 (-22, 9) |
| Violinist | R | 55, 19 (-14, 12) | 63, 32 (-27, 18) |
| Flutist | L | 60, 33 (21, 26) | 67, 41 (36, 20) |
| Flutist | R | 26, 85 (61, 62) | 37, 75 (48, 60) |

With no paw turn, the left paw twisted 143 degrees in the play of the violin, and the right paw
108 degrees. One body plays both roles, so the right turn shares the twist of the two right paws:
with 3 steps the violin paw twisted -1 degree and the flute paw 74 degrees, and with 4 steps -27
and 48 degrees. The flute grip of `pnpm wind-grip flutist` stays the same, because the hold sets
the palm of the paw. With no elbow axis turn, the right upper arm rolled 84 degrees in the violin play.

**Wrists.** The ring at x 0.2105 is slanted: its vertices lie up to 0.006 units from its mean
place along the forearm. A paw turn that took each vertex past that mean place plus 0.002 units
also turned 4 of its 14 vertices on each side. They made fins, slits, and a notch at each wrist,
in the rest mesh and in each pose. The turn now takes the part that the edges join to the next
ring, so the ring at x 0.2105 stays. The arm gate (`pnpm arm-check fox-violinist flutist --base
4bd42c3b9`), in degrees, p95, with the values before the fix in parentheses:

| Role | Arm | Forearm twist | Paw twist | Paw swing | Stretch |
|---|---|---|---|---|---|
| Violinist | L | 25 (24) | 46 (46) | 42 (42) | 0.10 (0.12) |
| Violinist | R | 26 (13) | 47 (22) | 48 (48) | 0.10 (0.10) |
| Flutist | L | 70 (69) | 138 (138) | 28 (28) | 0.07 (0.11) |
| Flutist | R | 36 (49) | 67 (93) | 64 (64) | 0.12 (0.12) |

The left paw of the flutist twists most in the rest, the lift, and the lowering, where the free
paw rests on the haunch with its palm to the body. A left turn of 6 steps gave 164 degrees there
and 72 on the violin, and 8 steps gave 113 and 60, so the left turn stays at 7 steps.

**Holds.** The holds of the fox before (`FOX_HOLD` of `src/pose/bowed-rig.ts` and `FOX_FLUTE` of
`src/pose/winds.ts`) fit the new body with no change: they are in H. The measures of the hold tools
(in parentheses the fox of `62bf447f4`):

| Measure | Violinist | Flutist |
|---|---|---|
| Note targets (`pnpm hold-fit`): worst error, share within 5 mm | 0.0 mm, 100 % (0.0 mm, 100 %) | 0.0 mm, 100 % (0.0 mm, 100 %) |
| Deepest upper arm in the body (the sweep of `hold-fit`): play, lift, rest, lowering | 3.6, 3.5, 1.8, 4.0 cm (3.8, 3.2, 3.0, 4.2 cm) | 2.9, 2.7, 2.6, 2.8 cm (1.3, 1.2, 1.0, 1.3 cm) |
| Body in the instrument and the seat (`pnpm body-clip`, limit 0.045 H) | CLIP: paws 2.4 cm in the play (0.069 H) and 2.5 cm in the lowering, left forearm 2.0 cm (CLIP: right paw 2.3 cm, left forearm 2.3 cm, left paw 1.9 cm) | PASS: right paw 0.8 cm (PASS: right paw 0.8 cm) |
| Folded faces at rest (L / R) | 0 / 4 (4 / 5) | 8 / 27 (3 / 0) |
| Violin reach (`pnpm hold-reach`): fingerboard, bow hair | 0.63 to 1.00, 0.160 to 0.345 m (0.42 to 1.00, 0.160 to 0.386 m) | - |
| Flute grips in the play: room to spare, L / R | - | 1.8 / 2.6 cm (5.9 / 7.4 cm) |

The left upper arm of the flutist goes into its arm root at each moment, also at rest. A clavicle
share from 0.55 at x 0.09 to 0 at x 0.14 gave 3.2 cm, and the rows of step 2 give 2.9 cm. The
paws of the violinist go into the violin as on the fox before. Both are open (`TODO.md`).

**Color map.** `tools/fox-maps.py` writes `fox-color.webp`, `fox-tan-color.webp`, and
`fox-normal.webp` from the source maps and the rig file:

```text
uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/fox-maps.py
```

The red map is the source scaled to 2048 pixels (Lanczos) with fur strands ("Fur strands"), WebP
quality 60, method 6 (Pillow 13.0.0). The hue of each texel stays, and the eye domes keep their
colors. The gaze shift of `tools/gaze_shift.py` is off (`GAZE_SHIFT`).

**Tan color map.** The tan map is the red map with one Oklab step of the orange fur only
(`TAN_STEP`): the lightness +0.06 and the hue +18 degrees, with no chroma step. A texel that leaves
the sRGB gamut takes the largest chroma in the gamut at its new lightness and hue. The share of the
step of a texel falls to 0 for a chroma below 0.09, a lightness above 0.82, or a hue more than 25
degrees from 50 degrees, so the cream, the dark socks, the lines, and the white keep the colors of
the source. The texels of the fur (58.3 % of the map) go from the median Oklab L 0.613, C 0.167,
h 46.0 to L 0.673, C 0.149, h 63.9.

**Normal map.** The same run writes `fox-normal.webp` from the normal map of the FBX: each x, y tilt
limited to 0.2 (0.65 % of the texels), a box scale to 1024 pixels, plus the tilts of the strands,
each sum limited to 0.2, the tilts times 4 in red and green, 255 in blue, and `cwebp -q 60
-sharp_yuv -m 6` (libwebp 1.5.0). The red fox and the tan fox share it.

**Fur strands.** The source maps paint the fur nearly smooth. The measures (`mapstats.py` of the
session: the strand contrast as the median RMS of the linear luma in 16-texel blocks over the block
mean at 2048 pixels, and the tilt of the normal map at 1024 pixels):

| Map | Fox now | Fox before | Tripo cat | Tripo wolf |
|---|---|---|---|---|
| Color: strand contrast, median | 0.053 | 0.034 | 0.235 | 0.167 |
| Color: fur luma (linear), median | 0.208 | 0.230 | 0.182 | 0.215 |
| Normal: tilt, median | 0.006 | 0.006 | 0.028 | 0.023 |
| Normal: tilt, mean | 0.018 | 0.018 | 0.044 | 0.052 |

So the maps tool adds the strands of `strands()` (`STRANDS`, seed 7): the RMS tilt 0.03, the luma
factor 0.08, and the half length 11 texels at 2048 pixels. The strand contrast of the web color
map is 0.065 by the same measure over the fur faces of the rig file.

The first strands had the tilt 0.06, the luma factor 0.16, and the half length 22 texels (the
strand contrast 0.128 by the same measure). In the hall they read as deep carved grooves, as in
wood or clay. One height gives the color strands and the tilts, so each dark groove of the color
map is also a groove of the normals, and the two cues add. The long strands were also more regular
than the strands of the Tripo bakes (`scratch/fur_measure.py` of the round, at 1024 pixels):

| Measure | Fox, first strands | Fox now | Tripo cat | Tripo wolf | Tripo dog |
|---|---|---|---|---|---|
| Strand length (half the peak of the autocorrelation), texels | 10.6 | 6.5 | 4.1 | 8.8 | 5.6 |
| Coherence of the strand direction, color map | 0.78 | 0.58 | 0.58 | 0.67 | 0.45 |
| High-pass RMS tilt | 0.051 | 0.027 | 0.055 | 0.059 | 0.015 |

**Hall colors.** The median Oklab L, C, h of the orange fur (C above 0.05, h 20 to 80 degrees, L
0.25 to 0.85) in crops of `pnpm close-views play --demo beethoven-5-4 --at <species> --azimuth 40
--no-fill --base 62bf447f4`:

| Crop | Fox before | Fox now |
|---|---|---|
| Red fox, head | 0.626, 0.109, 45.7 | 0.555, 0.109, 44.5 |
| Red fox, trunk and legs | 0.513, 0.108, 45.7 | 0.523, 0.114, 43.3 |
| Tan fox, head | 0.640, 0.107, 53.2 | 0.630, 0.110, 51.7 |
| Red foxes far back, in the back light | 0.380, 0.072, 48.6 | 0.378, 0.073, 49.3 |
| Source FBX, even gray light (`srcview.py` of the session) | 0.653, 0.095, 51.7 | 0.589, 0.102, 44.4 |

The new fur keeps the chroma of the fox before in each crop, and its hue is 1 to 2 degrees redder.
The map keeps the colors of the source, so it takes no color step.

**Differences from the source.** The app light is warm and comes from above. The left paw moves in
to the length of the right arm ("Even arms"). The arms are 1.25 times longer ("Arm length"). The
fore paws are smaller ("Paw size"). The eye domes lie on their spheres, and each eye has a blink
lid ("Eyes", "Lids"). The maps add fur strands ("Fur strands").

The export of the file and the maps. License of each file: CC BY-NC 4.0, as the FBX file.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/fox.rig.glb` | 1,051,856 bytes | `36e7bf690ef30eac3690bdca94267747741d986cb8f593e55cd4c245318f39a9` |
| `tripo-hand/fox.rig.json` | 16,272 bytes | `9fc9f5db992fb369358361efc358cd711854c4a3cbdf142ec7d9595fbb08ed9a` |
| `tripo-hand/fox-color.webp` | 172,080 bytes, 2048 × 2048 | `1e2a3fc91b1708228c25026edfcffc40a1f5fe8bba5a7390ee46836baf26dcfa` |
| `tripo-hand/fox-tan-color.webp` | 178,228 bytes, 2048 × 2048 | `77340995571173589a2a609f0099daffb635e8a8638a5617b8458e94d45e81ae` |
| `tripo-hand/fox-normal.webp` | 99,334 bytes, 1024 × 1024 | `377d69a822300e6f4265a5b8948d86481c9914e26b7d8a99a84e306fdf4f668f` |

### History

The first Tripo P2 fox (FBX SHA-256 `db116e3197e4f68838268a7a9c2def02427863545d6692c4435f5aaec4ed0845`)
took 12 rounds of edits in a live Blender. The second Tripo P2 fox (FBX SHA-256
`598c8e8d989d30c04548aa0b0da8967cd44311c3d69fe1b59fc3acf7265cd795`, Tripo files of `f033bd5d`) had a
hand rig in headless Blender with a head 1.17 times larger and legs 1.88 times longer. A Tripo CLI
fox with small dark bead eyes (task `10130f2a-0bd4-4acd-bd30-5d7d03c3a482`) was a trial, and it is
dropped. The third Tripo P2 fox (FBX SHA-256
`8b25bab74212f40292eaf9b3fbbb09519a961000f2ef73b1ba6c610b46e3f3c7`, task
`a4f84f84-0533-4be9-9ec7-c734527b7e66`) had three-digit paws, a gaze shift of the irises in the
map, the finish `eye` with the eye light, a key `bind_belly`, and a loose tail part. The fourth
Tripo P2 fox (FBX SHA-256 `8a73a54ad78571d82e0e9dfe755d7eaa436f248b21c789bf1def8585cdffeda7`, from
the sheet `fox3.png`) was the body of the foxes up to `62bf447f4`: new four-digit front paws on a
copy of the source (`fox_paws.py`), eyeballs 0.93 of their size, and H 0.380 m. The old files and
the steps of each edit are in the git history of this folder.
