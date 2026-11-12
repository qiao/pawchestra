# Rabbit model

This folder holds the Tripo P2 source mesh of the rabbit (`tripo-p2/`) and its hand rig
(`tripo-hand/`). The app does not serve these files. It loads the module
`src/models/studio/rabbit.ts`, which this chain writes:

```text
tripo-p2/rabbit.fbx             source mesh with quad faces
   │  pnpm hand-chain rabbit    chain tools/blender/hand/rabbit/
   v
tripo-hand/rabbit.blend         hand rig (design 4.4, "Hand rig")
   │  pnpm rig-export rabbit    the same run
   v
tripo-hand/rabbit.rig.glb       rigged mesh, with its summary rabbit.rig.json
   │  pnpm studio-body rabbit   the same run
   v
src/models/studio/rabbit.ts     studio body of the app
```

`tools/blender/hand/README.md` gives the steps of the chain. The section "Hand rig" below gives the
files, their sources, their licenses, and their checksums.

The files of the older bodies are removed: the route of `pnpm rig-mesh`, an older hand rig, and an
older Tripo mesh. Commit `cbc8db5e4` has these files and the sections of this file about them.

## Hand rig

`tripo-hand/` holds the hand rig of the rabbit ("tripo-hand/rabbit.blend" below), from the third
Tripo P2 mesh `tripo-p2/rabbit.fbx`, made in headless Blender by the route of the Tripo wolf: the
form, the colors, and the eye paint of the source, with no arm cut and no stretch. The `ANIMALS`
entry of the rabbit points to `tripo-hand/rabbit.rig.glb`.

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/rabbit.fbx`, `tripo-p2/rabbit.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |
| `tripo-hand/rabbit.blend` | Made in headless Blender 5.2 from `tripo-p2/rabbit.fbx` (below). License as the FBX file | `pnpm hand-chain rabbit` |
| `tripo-hand/rabbit.rig.glb` | Export of `tripo-hand/rabbit.blend`. License as the FBX file | `pnpm rig-export rabbit --blend assets/models/rabbit/tripo-hand/rabbit.blend --out assets/models/rabbit/tripo-hand/rabbit.rig.glb` |
| `tripo-hand/rabbit.rig.json` | Text summary of the export, for diffs | The same run |
| `tripo-hand/rabbit-color.webp` | Color map of the rabbit, from the color map of the Tripo FBX ("Color map" below). License as the FBX file | `uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/rabbit-maps.py` |
| `tripo-hand/rabbit-normal.webp` | Normal map of the fur, from the normal map of the Tripo FBX ("Normal map" below). License as the FBX file | The same run (cwebp 1.5.0) |

### tripo-p2/rabbit.fbx

The third Tripo rabbit: a slim cream rabbit in a T-pose with quad faces, long ears with pink
insides, brown eyes, and a round tail (the sheet `assets/images2/rabbit2.png` of the main checkout,
which git does not keep). Its arm tubes have 10 vertices around, and its leg tubes 12. It replaces
the second Tripo P2 rabbit (FBX SHA-256
`1d10fbd9b41f91df1776bc15da13df13398d9c23c740a77e85469e8d287eb249`).

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Task | The Tripo convert file `tripo_convert_74c7fd68-c6bd-4bc4-a0fb-a91d7269d209` |
| Writer | Tripo, FBX 7.4 binary. The FBX file links four maps of its folder `.fbm` by name |
| Contents | One mesh object, with no armature and no animation. 3,292 vertices and 3,566 faces: 2,942 quads and 624 triangles, no n-gon. One UV layer. No material |
| Parts | 9 parts: the body (3,140 vertices), two eyeballs (43 vertices each, open at the back), and six whisker strips (13, 10, and 10 vertices on each side). No vertices merge at 1e-5. 66 open edges, and 6 edges with more than two faces |
| Axes | The rabbit faces -y of Blender, so the import needs no turn. Then 1 unit from the soles to the ear tips, x ±0.3363 (the paw tips), and y -0.1536 to 0.1458 |

The folder `rabbit.fbm/` holds the base color map and the normal map of the Tripo file, as Tripo
wrote them (byte copies with new names: `tripo_rgb_*.jpg` and `tripo_normal_*.jpg`). The roughness
and the metallic maps are not kept.

| File | Size | Pixels | SHA-256 |
|---|---|---|---|
| `rabbit.fbx` | 222,572 bytes | | `5eedb256218d3e71cc4fe7879b496f9a18c3483adc48badb4f1680cfdc04354c` |
| `rabbit.fbm/rabbit_basecolor.jpg` | 4,037,611 bytes | 4096 × 4096 | `b49bd53b9384cd474bdc52aec3ca9a0b9813f28d1b843f5df090c1c12336d234` |
| `rabbit.fbm/rabbit_normal.jpg` | 2,087,550 bytes | 4096 × 4096 | `1913d724cccd3f4b4add798ef32d1b7aa1979d425f52b9fdc70e4abb8cb4453d` |

The color map paints a full eye on each eyeball (a black pupil, a brown iris, a white light at the
top of the pupil, and white around it), dark lash lines around the openings, a pink nose, pink
inner ears and paw pads, and white whiskers. The source pupils do not mirror: the left pupil lies
0.16 ball radii above the middle of the ball, the right one 0.05.

### tripo-hand/rabbit.blend

The hand rig of the third Tripo P2 rabbit (design 4.4, "Hand rig"), made in headless Blender 5.2
(`blender -b --factory-startup`) by one build script, by the route of the Tripo wolf
(`../wolf/README.md`). The source FBX is the target of the look: the body keeps the form, the
colors, and the eye paint of the source, with a crease angle of 180 and one scale of the whole
body. Three form edits change the source: the size of the eyeballs and their sockets ("Eyes"
below), the size of the front paws ("Paw size" below), and the mouth corners ("Smile" below). The arms and the legs keep the length
of the source: no cut, no split from the trunk, and no stretch.

| Item | Value |
|---|---|
| Size | 394,263 bytes |
| SHA-256 | `c53f231ae6b6f46c9f3122a4279a9ac61f510c2a2c8b172b42be11d086e4d9aa` |
| Origin | Made in Blender 5.2 from `tripo-p2/rabbit.fbx` |
| License | CC BY-NC 4.0, as the FBX file |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the ear tips, the soles at z = 0, the rabbit faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `rabbit`: 3,790 vertices and 4,012 faces (3,388 quads and 624 triangles, 7,400 triangles), flat faces, and the surface of `sa.add_surface()`. 27 faces are gloss (the pink nose). The 80 faces of the two eyeballs have the face attribute `eye`, and the 312 faces of the two lids the face attribute `lid`. The UV map of the FBX, and the property `texture` (`assets/models/rabbit/tripo-hand/rabbit-color.webp`) |
| Armature | `rabbit_rig`: the 30 body bones and the 20 arm segments and helpers of the simple route, at the joints of `tools/mesh-rigs/simple/rabbit-tripo.json` (the source joints, mapped by the paw turns and the paw edit). The Action `bind` holds the seated bind of the bind rules of that config, with no bind supination. The properties `palm`, `hinges`, `seat`, and `lids` come from the steps below |
| Facts | `height` 0.795385 (the shoulder joints at 1.4867 m for each unit, so that H is 0.2985 m, the H of the rabbit of main), `crease` 180, `backRoom` 0.01 |
| Eyes | The eyeballs of the mesh at 0.93 of the source, with the finish `eye` and the eye light (no `eyeFinish` in the entry), the irises of the source map moved a little out and the lash lines of the upper lids lighter ("Eyes" below), and a blink lid on each. No eye objects, so the app adds no bead eyes |

The export of the file (`pnpm rig-export rabbit --blend assets/models/rabbit/tripo-hand/rabbit.blend
--out assets/models/rabbit/tripo-hand/rabbit.rig.glb`). License of both files: CC BY-NC 4.0, as the
FBX file.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/rabbit.rig.glb` | 1,218,828 bytes | `524098bc05131464a9d46f260e1d319efc74d90d680f0898d4918c313603bfd1` |
| `tripo-hand/rabbit.rig.json` | 16,320 bytes | `e9606923f20d3f5d05a0b50a7c42501d2c20dc18aaec17b1037d023997778b35` |

The chain of the body is in `tools/blender/hand/rabbit/` (`build.py`, `make_config.py`,
`params.json`, `base-config.json`, `redits.py`, `rimport.py`, `rings.py`), and `pnpm hand-chain
rabbit` runs it (`tools/blender/hand/README.md`). Its scripts follow the scripts of the second Tripo
rabbit and the fourth Tripo cat. The edits, in the order of the work (`sa` is
`tools/blender/studio_armature.py`, x is the x of the left arm). Each edit is a need of the rig, the
seat, or the instrument:

- **Import.** `sa.import_source('assets/models/rabbit/tripo-p2/rabbit.fbx', 1e-5)`. The FBX faces
  -y, so no turn follows. No vertex merges. Each face is flat.
- **Arm rings.** Edge ring Subdivide (`bmesh.ops.subdivide_edges(bm, edges=<ring>, cuts=<n>,
  use_grid_fill=True)`) of closed strips of 10 quads around each arm: x 0.0994 to 0.1134 (1 cut),
  0.1134 to 0.144 (2 cuts), and 0.1923 to 0.2141 (2 cuts), and on the right arm also 0.1743 to
  0.1923 (1 cut). The end loops of a strip can have poles: only the strip must be quads. The mesh
  is not a mirror image, so the two arms have different clean strips.
- **Knee rings.** The same call with 2 cuts on the clean strip of 12 quads of the left leg at y
  0.1428 to 0.1615. The right knee has no clean strip, so its partial rings carry the bend.
- **Rings with no split.** The elbow from x 0.144 to 0.1923 on the left (poles at x 0.155 and
  0.176), the wrist from x 0.2141 to 0.271, the paw, the hip, and the leg below y 0.14.
- **Paws turned.** Each vertex past the arm ring at x 0.2068 turns rigidly about the rest forearm
  axis by whole ring steps of 36 degrees: -180 degrees on the left (5 steps) and 36 degrees on the
  right (1 step), 355 vertices on each side. New quads join the two cut rings of the strip x
  0.1923 to 0.2141 with the same step offset, and they take the planar UVs of the clean fur patch
  at UV (0.0423, 0.4721) ("Arm twist").
- **Eyes.** Each eyeball scales by 0.93 about the middle of its sphere, (±0.0367, 0.7004, 0.0486),
  as one piece, and moves 0.0022 units forward along the eye axis (0.2, 0, 0.98), x mirrored on
  the right. The skin within 0.035 units of the middle scales with it, and the share falls by a
  smoothstep to 0 at 0.055 units, toward the middle plane from |x| 0.012, and below y 0.68 (0 at
  y 0.64). The whiskers and the nose (z above 0.115) stay. The largest move is 0.0025 units
  ("Eyes" below).
- **Paw size.** The edit `paw` of `redits.py` (`{"kind": "paw", "length": 0.8, "wide": 0.8,
  "thick": 1.0, "ramp": 0.02, "width": [0, 0, 1]}`) scales each front paw past the wrist joint
  ("Paw size" below).
- **Surface.** `sa.add_surface(rabbit, 'rabbit', 'assets/models/rabbit/tripo-p2/rabbit.fbm/rabbit_basecolor.jpg',
  eye_fans=False, config=<rabbit-tripo.json>)`. The faces of the two eyeballs get the face
  attribute `eye`. 66 light faces over the nose of the nose box leave the gloss nose, so that they
  show the color map and no flat light square shows.
- **Armature.** The armature of the config with a palm for each side: the true palm of the
  source, (0, -0.994, 0.11) in the studio axes, from the mean normal of the pink paw pads, turned
  by the paw turn. The property `hinges` holds the elbow axis of the config of each side, turned
  about its bind upper arm by 6 degrees on the left and -37 degrees on the right. The hip joint
  lies at (0.0605, 0.2635, 0.0085), the place within 1.5 mm of the measured (0.06, 0.265, 0.01) at
  which the rest frames of the leg bones in Blender pass the check of `pnpm rig-export`.

The weights, in the order of the work, in the rest pose:

1. Automatic Weights, then Limit Total 4 and Normalize All, on a copy of the mesh with no loose
   part. Each vertex takes the row of its copy.
2. Arm rows: each vertex of a side with |x| from 0.0755, within 0.045 units of the line of the
   rest arm, takes one exact row with `sa.set_weight_row()`: a clavicle share and an elbow helper
   share, linear between the control rows below, and the rest on the 4 roll segments of the upper
   arm or the forearm. The elbow bend spreads over x 0.125 to 0.186.

   | x | 0.0755 | 0.0866 | 0.0955 | 0.1043 | 0.1143 | 0.1254 | 0.1365 | 0.1498 | 0.162 | 0.1753 | 0.1863 |
   |---|---|---|---|---|---|---|---|---|---|---|---|
   | Clavicle | 0.40 | 0.25 | 0.12 | 0.04 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
   | Elbow helper | 0 | 0 | 0 | 0 | 0 | 0 | 0.25 | 0.75 | 0.75 | 0.25 | 0 |

3. Wrist rows and knuckle rows as on the second Tripo rabbit: the bend share of the paw grows in
   12 equal steps of 0.0035 from 0.035 before the wrist joint, and the fingers share in 12 equal
   steps of 0.003 from 0.02 before the knuckle joint.
4. The vertices of the loose parts (the eyeballs and the whisker strips) and of the gloss nose
   take {`head` 1}: 235 vertices.
5. Ear rows: a plane across the base of each ear, through (0.045, 0.795, 0), (0.045, 0.79, -0.06),
   (0.02, 0.8, -0.03), and (0.075, 0.78, -0.03) (studio axes, x mirrored on the right). Each head
   vertex above the plane by 0.008 or more and with |x| above 0.002 takes {`ear_<side>` 1}, and
   each other vertex gives its ear share to `head` (460 ear and 282 head rows). No vertex lies in
   the band of 0.008 at the plane.
6. Smile: the map `smile` of `redits.py` (the values in `smile` of `params.json`) moves the mouth
   corners ("Smile" below). The step comes after the weights, so the automatic weights stay those
   of the mesh with no smile.

The trunk, the neck, the head, the hips, the legs, and the tail keep the automatic weights.

**Smile.** In the stage light, the slit under the muzzle pads shades as a dark line, and the chin
under it is in shade. The line of the source falls from the middle of the W to its lowest point at
|x| 0.02 to 0.028 and rises only 0.0045 units to the corner at |x| 0.043, so the mouth read flat
from the front and the 3/4 view. The map `smile`, the method of the Tripo cat (`../cat/README.md`,
"Smile"), moves each point by lift × a(|x|) × b(y − m(|x|)) × f(z) × c along (0, 1, −0.4): up,
and a little back. The lift is 0.007 units (10 mm in the app). m is the mouth line of the source,
linear between the [|x|, y] rows [0, 0.6336], [0.0071, 0.6315], [0.0144, 0.6302], [0.0205, 0.6295],
[0.028, 0.6295], [0.033, 0.632], [0.043, 0.6341], and [0.05, 0.636]. a is a smoothstep from 0 at |x|
0.006 to 1 at 0.032, 1 to 0.046, and a smoothstep to 0 at 0.078, so the middle of the W stays, the
lower curve rounds, the corner lifts fully, and the cheek fades. b is 1 from 0.004 below the line to
0.005 above it, and a smoothstep to 0 at 0.018 below (the chin) and 0.016 above (the pads and the
cheeks over the corner). f is a smoothstep from 0 at z 0.06 to 1 at 0.09, and c a smoothstep from
0 at 0.003 to 1 at 0.012 units from the nose box of `params.json`. The eyeballs stay. Each whisker
strip moves as one piece with the move of its root (its point nearest the middle plane). 100
vertices move, 20 of them of the whisker strips, by at most 0.0075 units. A lift of 0.005 read
too weak in the 3/4 view. The color map paints only a thin line there, so the edit is in the form
only.

**Smooth surface.** No relax, no region colors, no trunk scale, and no belly key: the form stays
the form of the source. In the seated bind the belly shows no dent and no dark fold from the front.

**Paw size.** In the app, the front paws of the source read too large. In shares of H, the
source paw is about as long as the paw of the Tripo cat. But against the distance of the shoulder
joints, it is 1.19 times as long and 1.23 times as wide as the paw of the cat, and against the arm,
1.07 and 1.12 times. The point edit `paw` (above) scales each front paw past the wrist joint of its
side (x 0.245) about that joint, in the frame of the paw: the rest forearm axis, the width axis +z
of the source turned with the paw turn, and the height axis square to the two. A point at the
distance d past the wrist joint takes the share smoothstep(0, 0.02, d) of the scale, so the wrist
has no step. The paw height, the arm, the bones of the arm, and the feet do not change.
`make_config.py` moves the knuckle joint and the tip of `fingers_<side>` with the same edit, and
the weight rows keep their rules. The left paw in the rest of each export
(`scratch/beagle/paw_measure.py`), in meters and in H:

| Measure | Source rabbit | Rabbit now | A-pose rabbit of main | Tripo cat |
|---|---|---|---|---|
| Length, wrist joint to tip | 0.134 (0.448) | 0.107 (0.359) | 0.083 (0.277) | 0.153 (0.450) |
| Width | 0.151 (0.505) | 0.121 (0.404) | 0.089 (0.298) | 0.166 (0.488) |
| Height | 0.069 (0.230) | 0.069 (0.230) | 0.070 (0.233) | 0.082 (0.243) |
| Length / shoulder distance | 0.643 | 0.514 | 0.306 | 0.541 |
| Width / shoulder distance | 0.724 | 0.579 | 0.330 | 0.587 |
| Length / arm (shoulder to wrist joint) | 0.507 | 0.406 | 0.241 | 0.472 |

The scale is a first step of 0.8. The paw stays larger than the mitten paw of the A-pose rabbit.
With the smaller paws, the note targets stay within 5 mm (`pnpm hold-fit violinist`), the faces
that fold at rest go from 39 to 13, and the depths of the play change by 0.5 cm or less.

**Arm twist.** The roll of each upper arm (from the clavicle), the twist of each forearm (the paw
from the upper arm), and the bend of each paw on its forearm (swing), in degrees, in each moment of
the hold `RABBIT_HOLD` of `src/pose/bowed-rig.ts` (`pnpm pose-preview violinist`):

| Moment | Left upper arm | Left forearm | Right upper arm | Right forearm | Left swing | Right swing |
|---|---|---|---|---|---|---|
| frog | -42.5 | -30.4 | -13.8 | 2.1 | 16 | 7 |
| tip | -42.5 | -30.4 | 3.6 | -23.2 | 17 | 7 |
| crossing | -38.1 | -32.2 | -13.8 | 8.5 | 16 | 8 |
| rest | 22.2 | 30.2 | -14.7 | 38.2 | 63 | 7 |
| lift50 | 9.7 | 41.8 | -19.8 | 31.8 | 29 | 11 |
| lower50 | 8.7 | 29.5 | -24.3 | 24.9 | 26 | 11 |
| stand | -42.0 | -32.2 | -14.2 | 3.8 | 17 | 7 |

With the right paw turned 2 steps, the right forearm twisted 59 degrees at the tip. With 1 step and
the rest hold of the second rabbit, it twisted 50 degrees at rest, and the left forearm 56 degrees.
The rest holds the bow upright at the right side (design 5.2). The paw grips the stick across the
palm, so the stick rises from the thumb side of the closed paw. A bow tip straight down twisted the
right forearm by about 175 degrees at rest. With the hair to the back and out, (1, 0, 1), the right
forearm twisted only 8 degrees at rest, but the bow turned about 150 degrees from the rest to the
via of the lift, and the paw flipped in the first part of each lift (paw jumps in 6.5 % of the
lift samples of `pnpm arm-check violinist`). The hair to the front and in, (-1, 0, -1), turns the
bow 72 degrees to the via, and the paw does not flip.

**Violin.** The arms reach 0.291 m from the shoulder joint to the middle of the palm (0.262 m on
the second Tripo rabbit). The violin is 0.9 of the violin of the app (0.456 m, `violinScale` of
`src/models/species.ts`, 0.75 before): the left paw reaches the fingerboard from 0.67 of its
length from the nut, and the bow paw 0.125 m of the hair (`pnpm hold-reach rabbit --instrument
violin`). The rule of a violin shop gives 0.541.

**Seat.** The thighs slope 15 degrees down and 8 degrees out in the bind, the shins lean 6
degrees forward, and each foot turns 15 degrees with the heel up, with the toes flat on the floor
(`legTurns` of the config, `tools/rig/leg_turns.py <config> 15 8 6 15`). The front of the seat
lies 0.05 units behind the knee joint of the bind, and 53 % of the thigh lies on the seat. The
legs keep the length of the source, so the seat height of the app is 0.196 m (`seatHeight` of
`src/models/studio/rabbit.ts`), near the 0.20 m of the Tripo cat. The chair of the app fits it.
The ankle joint is 0.113 m above the floor (0.086 m with flat feet), and the lowest point of each
foot is on the floor. With the shins 12 degrees forward and flat feet, the seat was 0.167 m.

**Lids.** A lid on each eye: 13 × 13 points from psi -40 to 40 degrees and lam -45 to 55 degrees
(45 degrees in and 55 out, the right lid mirrors the range) at 1.12 ball radii, and a lower strip
at 1.07 radii, held turned up 110 degrees into the head. The property `lids` holds the angle
1.919862 and the hinge axes, left (0.664632, 0.747171, 0) and right (0.662093, -0.749422, 0). The
lid faces take the UVs of the clean fur patch at UV (0.1697, 0.9168) at 0.93 UV for each unit, and
the row `head` 1. In the 21 steps of the blink no open lid point, side edge, or back edge leaves
the head (ray casts), and each open lid point lies 0.031 units or more under the skin. With the
lids of the second rabbit (psi ±60, lam -48 to 70, 1.14 radii, 126 degrees), 2 to 3 points left
the head in the first 6 steps.

**Eyes.** At the size of the source, each eye opening was 0.149 of the head width at the eye line
(front view of the bind, `eyemeasure.py` of the cat). With the balls and sockets at 0.93, it is
0.140. The scale moves the front of each ball back, so each ball also moves 0.0022 units forward,
and it stands 0.075 ball radii over the skin edge (0.094 in the source, 0.002 with no move). The
source paints each pupil at the nose side of its eye opening, with white only on the out side.
So the rabbit looked cross-eyed from the side and from the default camera. In the render, the pupil
sat 0.31 of the half width of the opening toward the nose in the 3/4 view of the string rows
(`close-views play --demo mozart-k525 --at rabbit --azimuth 40 --zoom 1.6 --time 10`), 0.27 in the
Close view of the test page, and 0.07 and 0.15 in its front view. `shift_eyes()` of
`tools/rabbit-maps.py` moves the iris of each eye on its own, with its pupil and its painted light,
as one decal on the ball. The target is the middle of the painted eye in a view 15 degrees above
the forward axis of the head, turned out by `GAZE_OUT` (0 degrees, below), at the mean height of
the two pupils. Each iris moves only 0.35 of the way to that target (`SHIFT_SHARE`), because the
full turn read wall-eyed from the front: the left iris turns 1.4 degrees and the right iris 1.3
degrees. The
white of the same eye, row by row, fills the place that the iris leaves, and the clean outer rim
of each iris fills its nose rim, so no mirror of one eye goes into the other and no seam shows.
So the eyes stay near the source paint, with a small move out. From the default camera the iris
shows below the upper lid.

The target first turned 4 degrees out (`GAZE_OUT` 4). In a front view of the bind (rays along the
head axis, `scratch/rabbit-face/eyeview.py` of the worktree), the pupil middle of the right eye
then lay 0.03 of the half width of the open ball out of the middle, and its iris middle 0.12: the
right eye looked a little out, past the viewer, while the left pupil lay 0.04 toward the nose. With
`GAZE_OUT` 0 the decals turn 1.4 and 1.3 degrees, and the pupils lie 0.07 (left) and 0.00
(right) toward the nose in the front view, 0.09 and 0.02 in a view 10 degrees above, and 0.19 to
0.20 in the 3/4 views (0.22 in the source). No eye looks out, and neither eye crosses.

The source paints a dark lash line on the rim of each socket, over the top of the iris. In the
stage light it read as a hard dark wedge, and the upper lid read stern. `soft_lash()` moves the
skin texels of the rim within 1.08 ball radii of the ball middle toward the fur color above the eye
(the median of the skin from 1.2 to 1.5 radii): the share is 0.8 up to 40 degrees from straight up
about the moved iris middle, and falls to 0 at 75 degrees, so a thin line stays and the outer
corner and the lower lid keep their paint. The mean luma of the changed texels goes from 123 to 168.
The rim faces of the upper lid face down into the socket (their normals point 0.84 to 0.96 down),
so the shade of the rim itself still shows as a thin dark line under the lid in the stage light.

The painted light of the source lies at the top of each pupil, under the upper lid, so with the
finish `varnish` the eyes showed no clear light from the front and the face read blank. The eyes
take the finish `eye` and the eye light of the app, which gives one clear light at the top left of
each pupil in the front view, the Close view, and the hall view. The pupils keep the size of the
source: each fills 0.44 to 0.57 of the open ball in the front view, so a larger pupil would hide
the brown ring of the iris.

**Color map.** `tools/rabbit-maps.py` writes `rabbit-color.webp` and `rabbit-normal.webp` from the
source maps, as `tools/wolf-maps.py`:

```text
uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/rabbit-maps.py
```

The color map is the source scaled to 2048 pixels (Lanczos), with the irises moved and the lash
lines of the upper lids lighter ("Eyes" above), WebP quality 60, method 6 (Pillow 13.0.0). Before
the WebP step, 11,382 texels change: 6,500 eyeball texels and 2,724 texels of the padding next to
them (the move of the irises), and 2,158 skin texels of the rims of the sockets (the lash lines). No
other texel changes.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/rabbit-color.webp` | 248,098 bytes | `d0814584d451d0c97777826b09b612092b4e7c97c20279e93d0c74e9af6f442e` |
| `tripo-hand/rabbit-normal.webp` | 142,378 bytes | `c18a8ae6ddbee8ad2b0d188376150e0dcb0dd9ecc393ba3fd06b91d13c3811b9` |

**Normal map.** Each x, y tilt of the normal map of the FBX limited to 0.2 (7.30 % of the
texels), a box scale to 1024 pixels, the tilts times 4 (`NORMAL_MAP_GAIN` of `src/scene/fur.ts`)
in red and green, 255 in blue, and `cwebp -q 60 -sharp_yuv -m 6` (libwebp 1.5.0). The mean
normal of the source is (-0.002, -0.005, 0.986).

**Differences from the source.** The app light is warm and comes from above, so the cream fur
reads warmer than in the even gray light of an FBX viewer. The eyes are 0.93 of the source, and
each iris sits 1.3 to 1.4 degrees farther out on its ball. The lash lines of the upper lids are
lighter, and the eyes take the eye light of the app. Each eye has a blink lid. The mouth corners
are 0.007 units higher ("Smile"). The front paws are 0.8 of the source in length and width. The paw turns move the seam of each wrist band.

### History

The first Tripo P2 rabbit (FBX SHA-256
`6ee4f87a767c16e80576e976244b013391857b53ef33e4a59996a6f120a85c44`) had a hand rig made in a live
Blender through the Blender MCP tools: arm and knee rings, the left paw turned 5 ring steps of
360/11 degrees, the bind with no supination, the crease 55, a Taubin relax, a seat with 64 % of
the thigh on it, the key `bind_belly`, its own eyes with blink lids, and the color map and normal
map of its FBX. The new mesh comes from a new turnaround sheet with a cuter form, and the steps
above repeat that work on it in headless Blender. The old files and the steps of each edit are in
the git history of this folder, at a385ad8ba^. The hand rig of the second mesh at c6f979952 had
point edits of the look (eyeballs 0.85 of the source, rounder cheeks, smaller paws, thicker arms,
thinner legs, shins 1.39 times longer, a thicker trunk, a Taubin relax, and a belly key), a crease
angle of 55, and a color map with a fur shift, a round iris, and softer brows. The last hand
rig of the second mesh (at 12edbabec) kept the form of its source, with the gaze shift of
`tools/gaze_shift.py`, the eye finish `eye` and the eye light, and a violin of 0.75. The third
mesh replaces it. Its files and steps are in the git history of this folder, at 12edbabec.
