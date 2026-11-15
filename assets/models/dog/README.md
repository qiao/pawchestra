# Dog model

This folder holds the Tripo P2 source mesh of the dog (`tripo-p2/`) and its hand rig
(`tripo-hand/`). The app does not serve these files. It loads the module `src/models/bodies/dog.ts`,
which this chain writes:

```text
tripo-p2/dog.fbx             source mesh with quad faces
   │  pnpm hand-chain dog    chain tools/blender/hand/dog/
   v
tripo-hand/dog.blend         hand rig (design 4.4, "Hand rig")
   │  pnpm rig-export dog    the same run
   v
tripo-hand/dog.rig.glb       rigged mesh, with its summary dog.rig.json
   │  pnpm body-module dog   the same run
   v
src/models/bodies/dog.ts     body of the app
```

`tools/blender/hand/README.md` gives the steps of the chain. The section "Tripo hand rig" below
gives the files, their sources, their licenses, and their checksums.

The files of the older body of the route of `pnpm rig-mesh` are removed. Commit `cbc8db5e4` has
these files and the sections of this file about them.

## Tripo hand rig

`tripo-hand/` holds the body of the app ("tripo-hand/dog.blend" below): a hand rig of the Tripo P2
beagle `tripo-p2/dog.fbx`, made by one build script in a headless Blender 5.2, as the Tripo wolf
(`../wolf/README.md`). The body keeps the colors and the eyes of the source, and the form of the
source but for two edits: one point edit makes the front paws smaller ("Paw size"), and one scale
makes the head smaller ("Head size"). No edit changes the trunk, the legs, the feet, or the tail.
The arms keep the length of the source: no cut, no split from the trunk, and no stretch. The
`ANIMALS` entry of the dog points to `tripo-hand/dog.rig.glb`.

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/dog.fbx`, `tripo-p2/dog.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |
| `tripo-hand/dog.blend` | Made from `tripo-p2/dog.fbx` by the scripted edits below. License as the FBX file | `pnpm hand-chain dog` |
| `tripo-hand/dog.rig.glb` | Export of `tripo-hand/dog.blend`. License as the FBX file | `pnpm rig-export dog --blend assets/models/dog/tripo-hand/dog.blend --out assets/models/dog/tripo-hand/dog.rig.glb` |
| `tripo-hand/dog.rig.json` | Text summary of the export, for diffs | The same run |
| `tripo-hand/dog-color.webp`, `tripo-hand/dog-normal.webp` | Web copies of the color map and the normal map of the FBX ("Maps" below). License as the FBX file | `uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/tripo-maps.py dog` |

### tripo-p2/dog.fbx

A friendly beagle in a T-pose with quad faces, made with Tripo P2 from the sheet of the beagle
(`assets/images2/beagle.png` of the main checkout). Its arm tubes have 13 vertices around.

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan, and given on 2026-11-11. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary. The maps lie beside the FBX file in the zip file |
| Contents | One mesh object, with no armature and no animation. 3,224 vertices and 3,526 faces: 2,888 quads and 638 triangles, no n-gon. One UV layer |
| Parts | 3 parts: the body with the ears and the tail (3,150 vertices), and one eyeball on each side: a dome of 37 vertices and 36 faces, open at its rim, a sphere of radius 0.0332 units about (±0.0383, 0.8997, 0.1132). 28 open edges (24 at the rims of the domes, 4 at a small hole of the left foot), and no edge with more than two faces |
| Box | In the body units (1 unit from the soles to the top of the head): x ±0.428 (the paw tips), z -0.261 (the tail) to 0.261 (the nose). The beagle faces -y in Blender, with its left side at +x, so the import needs no turn |

The folder `dog.fbm/` keeps two maps of the zip file under new names, as bytes. The roughness and
the metallic maps are not kept.

| File | Name in the zip file | Size | Pixels | SHA-256 |
|---|---|---|---|---|
| `dog.fbx` | `tripo_convert_b0d9dd04-81b3-40b7-a2b9-c9b0b88f3c5f.fbx` | 215,580 bytes | | `3b4d27bd21a9995dc93b45df58be137d2368a86d2e8670f0ae7ff49bb9f175e3` |
| `dog.fbm/dog_basecolor.jpg` | `tripo_rgb_fe9250cd-a8b7-4ee2-9e1a-46ea5e2af245.jpg` | 2,681,292 bytes | 4096 × 4096 | `5fd0994318064613e14c3df02e2343a6b8363c10ad8ac373fd5ecfeeb7d61969` |
| `dog.fbm/dog_normal.jpg` | `tripo_normal_e4c004ed-3c63-4789-b628-5a54c10471de.jpg` | 1,003,568 bytes | 4096 × 4096 | `8021d77abbff352c5d2469f8f437c8a3b868a517ce67c047bea90d6eee95d49b` |

The color map paints an orange and cream beagle: orange ears, head, back, and upper arms, a cream
blaze, muzzle, chest, belly, legs, and paws, a white tail tip, a dark brown nose, freckles on the
muzzle, a smile line, and on each eyeball a brown iris, a black pupil, and two white lights.

### tripo-hand/dog.blend

The hand rig (design 4.4, "Hand rig"). The chain of the body is in `tools/blender/hand/dog/`
(`build.py`, `make_config.py`, `params.json`, `base-config.json`, `eye-centers.json`, `redits.py`,
`rimport.py`, `rings.py`), and `pnpm hand-chain dog` runs it (`tools/blender/hand/README.md`). Its
scripts are those of the Tripo wolf with the values of the beagle. `make_config.py` writes
`tools/mesh-rigs/simple/dog-tripo.json`: the joints of the source.

| Item | Value |
|---|---|
| Size | 393,883 bytes. A new build gives the same export, but not the same `.blend` bytes |
| Axes | The body units in the axes of Blender: 1 unit from the soles to the top of the head, the soles at z = 0, the beagle faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `dog`: 3,770 vertices and 4,020 faces (3,382 quads and 638 triangles, 7,402 triangles), flat faces, and the surface of `sa.add_surface()`. No face is gloss: the 115 faces of the nose take the slot `fur` and the color map, with the smooth normals of the fur ("Nose"). The 72 faces of the two eyeballs have the face attribute `eye`, and the 312 faces of the two lids the face attribute `lid`. The UV map of the FBX, and the property `texture` (`assets/models/dog/tripo-hand/dog-color.webp`) |
| Armature | `dog_rig`: the 30 body bones, `tail_tip`, and the 20 arm segments and helpers, at the joints of the config. The Action `bind` holds the seated bind with no bind supination. The properties `palm`, `hinges`, `seat`, `lids`, and `headFactor` come from the steps below |
| Facts | `height` 0.977184 (the shoulder joints at 1.508 m for each unit, so that H is 0.41623 m, 1.27 times the H of the dog of main: "Size" below), `crease` 180 |
| Eyes | The eyeballs of the source, with the finish `varnish` and no eye light (`eyeFinish` of the entry), and a blink lid on each. No eye objects, so the app adds no bead eyes |

The edits, in the order of the build (`sa` is `tools/blender/body_armature.py`, x is the x of the
left side):

- **Import.** `sa.import_source('assets/models/dog/tripo-p2/dog.fbx', 1e-5)`. No vertex merges,
  and each face is flat. No part goes: the source has no hidden loose inner part.
- **Arm rings.** Edge ring Subdivide (`bmesh.ops.subdivide_edges(bm, edges=<ring>, cuts=1,
  use_grid_fill=True)`) of the clean quad bands of 13 edges between the arm loops at x 0.121,
  0.137, 0.158, 0.182, and 0.201, and at x 0.246, 0.281, 0.303, and 0.318. The loops at x 0.201 and
  0.246 run through 2 poles in front of the elbow, so the build takes the band next to the closed
  loop at the other end. A ring then stands about each 0.25 arm radii.
- **Rings with no split.** The band from x 0.201 to 0.246 at the elbow has the poles and 4
  triangles in front: its back has rings at x 0.212 and 0.229, and its front one long quad band.
  The legs take no split: their rings stand about each 0.015 to 0.02 units.
- **Paws turned.** Each vertex past the arm ring at x 0.2814 turns rigidly about the rest forearm
  axis by whole ring steps of 360/13 degrees: -110.8 degrees on the left (4 steps) and 27.7 degrees
  on the right (1 step), 209 vertices on each side. New quads join the two rings with the step
  offset, and the far ring takes the form of the ring before the turn (a fade to 0 at 0.02 units).
  The new quads keep the UVs of the old band. The paws keep their form ("Arm twist").
- **Wrist loop.** The ring at x 0.2814 does not turn. It is slanted, so 2 of its 13 vertices lie
  past its mean along the forearm axis. When they turned with the paw, the quads before the ring
  sheared into a pinched wrist with a slit and a fan of stretched fur: 4 faces on the left and 5 on
  the right had UV scale ratios of 2.7 to 29.9, against about 1.1 on the faces around them.
- **Point edits.** One: the edit `paw` of the front paws ("Paw size" below). The trunk, the arms,
  the legs, the feet, and the tail keep the form of the source. The head scale comes after the
  weights ("Head size" below).
- **Surface.** `sa.add_surface(dog, 'dog', <base color>, eye_fans=False,
  config=<dog-tripo.json>)`. The gloss nose is the dark nose in the nose box of the config.
- **Eyes.** The 72 faces of the two eyeballs take the face attribute `eye`.
- **Armature.** The joints of the config: the shoulder at x 0.10, the elbow at x 0.205, the wrist
  at x 0.31, the knuckles at x 0.364 (x 0.375 in the source, moved by the paw edit), the hip at
  (0.083, 0.28, 0.035), and the knee at (0.083, 0.16, 0). The palm is the true palm of the source, the mean normal of the paw faces that face
  down, (0.155, -0.988, -0.012), turned by the paw turn. The bind arms (`bindArms`) and the trunk
  (`open` 1) are those of the dog of main. The elbow axis of each side turns about its bind upper
  arm (`hingeTurn`): 8 degrees on the left and -20 degrees on the right ("Arm twist").

The weights, in the rest pose (the head and ear bones of the rig stand at their places before
the head scale):

1. Automatic Weights, then Limit Total 4 and Normalize All, on a copy of the mesh with no tail and
   no eyeball.
2. Arm rows: each vertex of a side with |x| from 0.10, within 0.07 units of the line of the rest
   arm, takes one exact row (`sa.set_weight_row()`): a clavicle share from 0.4 at x 0.10 to 0 at x
   0.14, an elbow helper share that grows from 0 at x 0.17 to 1 at the elbow joint (x 0.205) and
   falls to 0 at x 0.241,
   and the rest on the 4 roll segments. The 8 vertices of the ear tips in that reach, which the
   automatic weights give mostly to the head, the ears, and the neck, keep their rows.
3. Wrist rows: the bend share of the paw grows in 12 equal steps of 0.004 from 0.04 units before
   the head of `hand_<side>`. Knuckle rows: the fingers share grows in 12 equal steps of 0.0035 from
   0.02 units before the head of `fingers_<side>`.
4. The eyeballs and the gloss nose take {`head` 1}. The tail is the part that a flood from its
   lowest point reaches through vertices with z below -0.095 (148 vertices). It takes {`hips`
   1 - a, `tail` a (1 - c), `tail_tip` a c}, with a = smoothstep(-0.01, 0.03) along `tail` and c =
   smoothstep(-0.04, 0.04) along `tail_tip`.
5. Head scale (`scale_head()` of `build.py`, `headScale` {`factor` 0.9} of `params.json`): the
   head gets smaller, with the weights as they are ("Head size" below). The lids come after it.

**Smooth surface.** No relax and no region colors. The crease angle 180 gives each corner the mean
normal of the faces at its vertex, as the smooth shading of an FBX viewer.

**Nose.** At the end of the build, the 115 gloss faces of the dark nose go to the slot `fur`
(`noseFur` of the params). Thus the nose takes the color map, with its painted nostrils, and the
smooth normals of the fur. As flat gloss faces in one color, the nose showed facets and no nostrils.
The weights do not change: the nose vertices keep the row {`head` 1}. The armature property
`headShift` (0, 0, -0.007327586) moves the head center of the holds back to the head center of the
gloss nose, because the head box of `pnpm body-module` now holds the nose. Thus no hold moves. The
nose keeps the colors of the source map. In the hall light it reads as the nose of the FBX file, so
the map tool does not change it.

**Seat.** The thighs slope 25 degrees down and turn 30 degrees out in the bind, and the shins are
vertical, as on the dog of main, so that the knees spread around the lower bout of the cello. The
property `seat` is {`prop` `chair`, `front` 0.0785, `back` -0.1, `halfWidth` 0.17}: the front lies
0.055 units behind the knee joint of the bind, the nearest place that keeps the back of each knee
off the seat, and 44 % of the thigh lies on the seat. The seat height is 0.191 m (0.265 m on the
dog of main), with the short legs of the source. The tail keeps its form: it goes back over the
back edge of the seat, and its tip turns up behind the seat (`tailBind`).

**Size.** The body scales to 1.27 times H of the dog of main (`metersPerUnit` 1.508 of
`tools/mesh-rigs/simple/dog-tripo.json`), so that the beagle reads a little larger than the Tripo
cat of the violas beside it. The scale changes only the fact `height` of the armature: the mesh,
the bones, and the weights of the export stay. The seat height follows the legs. The measures in
the app, in meters, with the seated values from the bind of each player:

| Measure | Tripo cat | Beagle at H of main | Beagle now | Now / cat |
|---|---|---|---|---|
| Standing, to the top of the head | 1.384 | 1.187 | 1.508 | 1.09 |
| Standing, to the ear tips | 1.484 | 1.187 | 1.508 | 1.02 |
| Seated, top of the head above the floor | 1.260 | 1.108 | 1.407 | 1.12 |
| Seated, ear tips above the floor | 1.360 | 1.108 | 1.407 | 1.03 |
| Distance of the shoulder joints | 0.282 | 0.238 | 0.302 | 1.07 |
| Head height H | 0.339 | 0.328 | 0.416 | 1.23 |
| Seat height | 0.201 | 0.150 | 0.191 | 0.95 |

The ears of the beagle hang, so the step compares the top of the head with no ear. A step to 1.1
times the ear tips of the cat makes the head of the beagle about 1.3 times the head of the cat.
The table gives the head before the head scale. With the head scale ("Head size"), the top of the
head stands 1.455 m high standing and 1.354 m seated: 1.05 and 1.07 times the cat.

**Paw size.** This is an exception to the wolf route, which keeps the form of the source. In the
app, the front paws of the source read too large: the arms are short and the head is large. In
shares of H, the source paw is about as long as the paw of the dog of main. But against the
distance of the shoulder joints (the width of the trunk), it is 1.23 times as long and 1.55 times
as wide. The point edit `paw` of `redits.py` (in `params.json`: `{"kind": "paw", "length": 0.82,
"wide": 0.8, "thick": 1.0, "ramp": 0.02, "width": [0, 0, 1]}`) scales each front paw past the wrist
joint of its side (x 0.31) about that joint, in the frame of the paw: the rest forearm axis, the
width axis +z of the source turned with the paw turn, and the height axis square to the two. A
point at the distance d past the wrist joint takes the share smoothstep(0, 0.02, d) of the scale,
so the edit fades in over the wrist ring at x 0.318, and the wrist has no step. The paw height,
the arm, the bones of the arm, and the feet do not change. `make_config.py` moves the knuckle joint
and the tip of `fingers_<side>` with the same edit, and the weight rows keep their rules. The left
paw in the rest of each export (`scratch/beagle/paw_measure.py`), in meters and in H:

| Measure | Source beagle | Beagle now | Dog of main | Tripo cat |
|---|---|---|---|---|
| Length, wrist joint to tip | 0.180 (0.432) | 0.148 (0.355) | 0.139 (0.424) | 0.153 (0.450) |
| Width | 0.183 (0.439) | 0.146 (0.352) | 0.112 (0.342) | 0.166 (0.488) |
| Height | 0.113 (0.272) | 0.114 (0.273) | 0.091 (0.279) | 0.082 (0.243) |
| Forearm girth at the wrist joint | 0.380 (0.913) | 0.376 (0.903) | 0.267 (0.816) | 0.317 (0.933) |
| Length / shoulder distance | 0.597 | 0.489 | 0.485 | 0.541 |
| Width / shoulder distance | 0.606 | 0.486 | 0.390 | 0.587 |
| Length / arm (shoulder to wrist joint) | 0.567 | 0.465 | 0.347 | 0.472 |

With the smaller paws, the hold does not change. Against the body of HEAD 12edbabec, the note
targets stay within 5 mm (`pnpm hold-fit cellist`). The claws go at most 2.3 cm into the cello in
the play (3.5 cm before) and 4.6 cm at rest (4.7 cm before). The arm gate (`pnpm arm-check
cellist --base`) has no FAIL and no WORSE: the twist p95 of the left arm goes from 33° to 31°, and
the forearm twist p95 from 44° to 37°. The bow paw touches the stick in each sample, with the stick
0.2 cm in the closed paw (median). The median gap from the finger tips to the bow goes from 0.4 cm
to 0.7 cm, so the share of the play samples in which the paw holds the bow goes from 59 % to 44 %
(the rule of `tools/wind-grip.ts` with a temporary row for the cellist). "Bow grip" below fits
the bow to the smaller paw.

**Head size.** This is the second exception to the wolf route. In the app, the head of the source
read too large: H was 1.38 times the distance of the shoulder joints (1.20 on the Tripo cat and
1.14 on the dog of main). The build scales the head by 0.9 about the neck joint N (0, 0.65, 0.02),
with the head weight as the share: each vertex goes to p + s (0.9 - 1) (p - N), with s the summed
weight of the vertex on `head`, `ear_L`, and `ear_R`. The head, the ears, the eyeballs, the nose,
and the muzzle (s = 1, 1,298 vertices) scale as one piece. The move fades with the head weight over
the neck rings (139 vertices from y 0.645 to 0.884, most of them at the nape and the throat), so no
step shows. The arms, the paws, and the trunk have no head weight, so they stay. The largest move is
0.035 units (5.3 cm). The bones `head`, `ear_L`, and `ear_R` scale about N with the mesh: the head
joint goes to (0, 0.704, 0.029), and each ear joint to (±0.099, 0.884, 0.002) with its tip at
(±0.1485, 0.722, 0.038). `make_config.py` writes these joints into the config. The weight rows do
not change. The lids are made after the scale, so they fit the scaled balls.

This is the head growth of `pnpm rig-mesh` (`headFactor`) with the factor 0.9. Thus the armature
has the property `headFactor` 0.9, the export writes it, and `pnpm body-module` measures H and the
head center before the factor (design 4.4). H stays 0.41623 m, the head center moves 0.05 mm, and
each hold in units of H keeps its place. The measures, with `scratch/beagle/head_measure.py` (the
fur vertices that follow the head most, in the rest, and the seated bind):

| Measure | Beagle before | Beagle now | Tripo cat | Dog of main |
|---|---|---|---|---|
| Head height, chin to top | 0.416 m | 0.372 m | 0.339 m | 1.14 shoulder distances |
| Head width, no ears | 0.312 m | 0.281 m | 0.482 m | 1.52 shoulder distances |
| Ear length, root joint to tip | 0.311 m | 0.280 m | 0.180 m | 0.88 head heights |
| Distance of the shoulder joints | 0.302 m | 0.302 m | 0.282 m | |
| Head height / shoulder distance | 1.38 | 1.23 | 1.20 | 1.14 |
| Seated, top of the head above the floor | 1.407 m | 1.354 m | 1.260 m | |
| Seated, ear tips above the floor | 0.977 m | 0.967 m | 1.200 m | |
| Standing, to the top of the head | 1.508 m | 1.455 m | 1.384 m | |

The head height of the table counts the chin in the neck fade, so it is 0.893 of the value
before, and not 0.9. The seated head top of the beagle is now 1.07 times the head top of the cat
(1.12 before).

**Ears.** The long ears hang to the top of each shoulder in the source. They follow the head and
their ear bones, and in the moments of the cellist they lie on the shoulders with no visible cut
into the arms or the cello. No weight fix was necessary.

**Cello place.** The cello of the beagle stood in its chest: in each sample of the play, the rest,
and the moves, the back of the upper bout went 11 to 12.4 cm into the chest at the sternum. The fit
of the place tested only the middle line of the back, and that line lay left of the round chest.
Now the fit also tests 4 lines across the upper half of the back (`DOG_HOLD.fit.across` 0.2 of the
body length to each side), with the back 0.02 H in front of the body, and the cello leans back 20°
in place of 25.7°. The trunk leans 9° forward in the play (3° before), the right shoulder turns
28° forward (20° before), and the bow paw turns on the stick (`stickTurnR`, 26°), so that the short
bow arm reaches the strings in front of the chest with no flip. At rest, the left paw holds the
neck at 0.3 of the fingerboard (0.6 before). The full sweep (`pnpm pose-depth cellist`, 18 demos),
deepest point in cm, before and now:

| Pair | Play | Lift | Rest | Lower |
|---|---|---|---|---|
| Cello in the body | 12.4, 2.4 | 11.9, 1.5 | 11.0, 0.0 | 11.8, 1.4 |
| Paws in the cello | 1.2, 0.8 | 4.4, 2.2 | 4.3, 1.8 | 4.4, 2.1 |
| Claws in the cello | 2.3, 1.1 | 4.6, 0.9 | 4.6, 0.6 | 4.6, 0.9 |
| Forearms in the cello | 1.9, 2.4 | 0.0, 0.0 | 0.0, 0.0 | 0.1, 0.0 |
| Upper arms in the body | 3.0, 1.7 | 2.8, 1.3 | 1.0, 0.8 | 3.0, 1.4 |

The cello in the play presses the chest by about 1.5 to 1.8 cm, and in 1 sample of 991 the scroll
touches the head by 2.4 cm. The left forearm goes up to 2.4 cm into the back of the neck in 0.3 %
of the play samples, in the middle positions, where the nearly straight arm passes behind the
neck. The left paw holds the neck at rest with the palm 1.8 cm in it. The arm gate passes (`pnpm
arm-check cellist --base 4472dc8aa`), the note targets are within 5 mm in each sample (`pnpm
hold-fit cellist`, worst 1.3 mm), and the left upper arm of the play turns 31° (62° before).

**Bow grip.** With the grip of `BOW_GRIP`, the bow stick lay under the palm of the smaller paw,
and the finger tips stayed about 5 cm from it, so the paw held the bow in no play sample. Now the
stick lies under the curled finger tips at the frog end, across the fingers, and the tips close
over it, as a cellist drapes the fingers over the stick (`docs/reference/string-technique.md`,
3.3). The fit has three values:

- `SpeciesParams.bowGrip` of the dog puts the grip 0.7 of the way from the middle of the closed
  paw to the mean of its finger tips (the corners of `tools/wind-grip.ts`), in the axes of the
  hand. The paw is rigid in these axes, so one grip fits each sample.
- The right fingers curl 65° (`DOG_HOLD.curlR`, 45° for the other holds). With 75° or more, the
  skin of the knuckles folds over in each play sample. With 105°, the stick goes through the
  middle of the closed paw, but 20 faces of the knuckles fold.
- The bow paw turns on the stick with the forearm at 0° in the plane of the palm
  (`DOG_HOLD.stickTurnR`). With 26°, the grip at the tips bends the bow elbow further, and the
  folds p95 of the right arm go from 2 to 10 (limit 8).

The measures of the right paw on the stick (`pnpm wind-grip cellist`, `bach-bwv1047`, the median
of each set), before and now:

| Set | Holds | Tip gap (cm) | Stick from the paw middle (cm) | Stick in the paw (cm) | Palm angle |
|---|---|---|---|---|---|
| Play | 0 %, 100 % | 5.2, 0.1 | 5.5, 5.3 | 0.3, 1.1 | 25°, 16° |
| Lift | 0 %, 100 % | 5.6, 0.1 | 5.5, 5.3 | 0.3, 1.2 | 26°, 29° |
| Rest | 0 %, 100 % | 4.1, 0.5 | 5.7, 5.5 | 0.2, 1.4 | 30°, 51° |
| Lower | 0 %, 100 % | 4.1, 0.4 | 5.3, 5.3 | 0.3, 1.2 | 23°, 27° |

The stick leaves the paw 23° from the thumb side in the play (9° before). The note targets stay
within 5 mm (`pnpm hold-fit cellist`, worst 0.0 mm). The arm gate passes (`pnpm arm-check
cellist --base`): the right arm folds p95 4 (2 before), twist p95 19° (20°), forearm twist p95 32°
(29°), and paw twist p95 66° at rest (60°). The sweep of `bach-bwv1047` and `bach-bwv1048`
(`pnpm pose-depth cellist --base`) puts no bow and no paw deeper into the cello, and the bow
stays out of the cello and the body. The right upper arm goes 1.4 cm into the arm root at rest
(0.8 cm before, limit 1.5 cm).

**Lids.** A lid on each eyeball: 14 × 13 points from psi -55 to 45 degrees and lam from -50 to 62
degrees on the left (the mirror on the right), with the lower strip as the first row, at 1.17 ball
radii. The lids fit the scaled balls (radius 0.0299 units). 156 quads on each side, held turned up
126 degrees into the head. The property `lids` holds the angle 2.199115 and the hinge axes. The lid
faces take the orange fur patch at UV (0.625, 0.56) at 0.75 UV for each unit, and the row `head` 1.
In the 21 steps of the blink no open lid point, side edge, or back edge leaves the head (ray casts),
and the open lid lies at least 0.015 units under it.

**Arm twist.** The roll of each upper arm and the twist of each forearm, in degrees, in each moment
of the cellist (`pnpm pose-preview cellist`):

| Moment | Left upper arm | Left forearm | Right upper arm | Right forearm |
|---|---|---|---|---|
| frog | 37.4 | -35.3 | -22.2 | -43.6 |
| tip | 37.3 | -34.0 | -32.7 | -31.2 |
| crossing | 37.3 | -33.3 | -24.1 | -39.2 |
| rest | 44.5 | 27.9 | -40.1 | 91.9 |
| lift50 | 42.6 | 10.3 | -23.6 | -6.3 |
| lower50 | 41.7 | -1.0 | -22.7 | -21.6 |

With the paws of the source and no hinge turn, the left forearm twisted -154 degrees in the play,
and the right forearm 139.5 degrees at rest. The paw turn and the hinge turn add the same angle to
each moment of a side, so they cannot make the spread of the right forearm smaller: from 4 degrees
at the frog to 139.5 degrees at rest. The rest of the right forearm keeps 91.9 degrees, so that each
moment of the play stays within 45 degrees. The table gives the hold before the cello place of
"Cello place" below. With that place, the left paw holds the strings further from the shoulder,
and the same measure gives:

| Moment | Left upper arm | Left forearm | Right upper arm | Right forearm |
|---|---|---|---|---|
| frog | 20.8 | -72.0 | -24.3 | -33.5 |
| tip | 19.2 | -67.4 | -35.0 | -22.4 |
| crossing | 18.4 | -65.2 | -26.2 | -29.8 |
| rest | 30.7 | -24.1 | -23.5 | 59.6 |
| lift50 | 28.0 | -43.0 | -14.8 | -12.9 |
| lower50 | 26.7 | -49.6 | -15.6 | -25.0 |

The left forearm of this measure is the turn of the paw from the upper arm, so it holds the tilt
of the paw over the neck (`tiltL` 45°). The arm gate measures the twist of the skin: the forearm
twist p95 stays 37° on the left and goes from 32° to 29° on the right (`pnpm arm-check cellist`).
A larger tilt makes the left forearm of the table smaller (-41.5° to -43.6° in the play at 60°), but
the paw then bends sideways on the wrist past the limit of the gate (107° p95 at 65°).

**Maps** (`tools/tripo-maps.py dog`). The tool scales the color map to 2048 pixels (Lanczos) and
writes WebP quality 60, method 6 (Pillow 13.0.0). No texel changes its color: the fur, the ears, and
the eye paint stay. In the play view and in the high hall view of the app, the gaze reads as a look
at the viewer, so no iris moves. The same run writes `dog-normal.webp` from the normal map of the
FBX: each x, y tilt limited to 0.2 (1.21 % of the texels), a box scale to 1024 pixels, the tilts
times 4 in red and green, 255 in blue, and `cwebp -q 60 -sharp_yuv -m 6` (libwebp 1.5.0).

**Differences from the source.** The app light is warm and comes from above, so the orange fur reads
more saturated and the cream reads warmer than in the even gray light of an FBX viewer. The front of
each elbow has one long quad band, so the inner elbow folds in straight lines.

The export of the file and the maps. License of each file: CC BY-NC 4.0, as the FBX file.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/dog.rig.glb` | 1,084,080 bytes | `764c55c0b4528b5b85d27da7633a2dbe353a2a8c2062c50591a4013501d64c30` |
| `tripo-hand/dog.rig.json` | 16,214 bytes | `8f1df5b81092363bff883989308bddcc9cd04577c43fe4d947d9838aaffd51e8` |
| `tripo-hand/dog-color.webp` | 118,948 bytes, 2048 × 2048 | `a40fcf698fb40ff0d95c1a580f93b7f9999e05e4e3adcadac2eae14abeabaded` |
| `tripo-hand/dog-normal.webp` | 28,924 bytes, 1024 × 1024 | `9e96ae9a9353cd93673333c33a3907dbef87813ef3858a2d7c5de930786fd075` |
