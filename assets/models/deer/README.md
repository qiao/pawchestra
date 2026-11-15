# Deer model

This folder holds the Tripo P2 source mesh of the deer (`tripo-p2/`) and its hand rig
(`tripo-hand/`). The app does not serve these files. It loads the module
`src/models/studio/deer.ts`, which this chain writes:

```text
tripo-p2/deer.fbx             source mesh with quad faces
   │  pnpm hand-chain deer    chain tools/blender/hand/deer/
   v
tripo-hand/deer.blend         hand rig (design 4.4, "Hand rig")
   │  pnpm rig-export deer    the same run
   v
tripo-hand/deer.rig.glb       rigged mesh, with its summary deer.rig.json
   │  pnpm studio-body deer   the same run
   v
src/models/studio/deer.ts     studio body of the app
```

`tools/blender/hand/README.md` gives the steps of the chain. The section "Tripo hand rig" below
gives the files, their sources, their licenses, and their checksums.

The files of the older body of the route of `pnpm rig-mesh` are removed. Commit `cbc8db5e4` has
these files and the sections of this file about them.

## Tripo hand rig

`tripo-hand/` holds the body of the harpist: a hand rig of the Tripo P2 fawn `tripo-p2/deer.fbx`,
made by one build script in a headless Blender 5.2, by the route of the Tripo wolf
(`../wolf/README.md`, "Tripo hand rig"). The body keeps the form, the colors, and the eye paint of
the source. Two point edits change the form: the eyeballs and their sockets are smaller ("Eyes"),
and the upper arms and the forearms are 1.5 times longer ("Arm stretch"). No point edit changes the
head, the ears, the trunk, the hooves, the legs, or the tail. The arms have no cut and no split from
the trunk. The `ANIMALS` entry of the deer points to `tripo-hand/deer.rig.glb`. The files of the old
deer above do not change.

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/deer.fbx`, `tripo-p2/deer.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |
| `tripo-hand/deer.blend` | Made from `tripo-p2/deer.fbx` by the scripted edits below. License as the FBX file | `pnpm hand-chain deer` |
| `tripo-hand/deer.rig.glb` | Export of `tripo-hand/deer.blend`. License as the FBX file | `pnpm rig-export deer --blend assets/models/deer/tripo-hand/deer.blend --out assets/models/deer/tripo-hand/deer.rig.glb` |
| `tripo-hand/deer.rig.json` | Text summary of the export, for diffs | The same run |
| `tripo-hand/deer-color.webp`, `tripo-hand/deer-normal.webp` | Web copies of the color map and the normal map of the FBX ("Color map" and "Normal map" below). License as the FBX file | `uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/tripo-maps.py deer` |

### tripo-p2/deer.fbx

A slim spotted fawn in a T-pose with quad faces, made with Tripo P2 from the sheet of the deer
(`assets/images2/deer.png` of the main checkout): large ears, a long neck, dark cloven hooves on
the arms and the legs, and a short white tail.

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan, and given on 2026-11-12. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary. The maps lie beside the FBX file in the zip file |
| Contents | One mesh object, with no armature and no animation. 3,218 vertices and 3,477 faces: 2,947 quads and 530 triangles, no n-gon. One UV layer |
| Parts | 3 parts: the body with the tail (2,959 vertices) and two eyeballs (129 and 130 vertices, spheres of radius 0.0217 about (±0.0376, 0.8657, 0.0628)). No open edge, and no edge with more than two faces |
| Box | In the studio units (1 unit from the soles to the ear tips): x ±0.353 (the hoof tips), z -0.189 (the tail) to 0.189 (the nose). The fawn faces -y in Blender, with its left side at +x, so the import needs no turn |

The folder `deer.fbm/` keeps two maps of the zip file under new names, as bytes. The roughness and
the metallic maps are not kept.

| File | Name in the zip file | Size | Pixels | SHA-256 |
|---|---|---|---|---|
| `deer.fbx` | `tripo_convert_2f47e7fc-ef55-4883-ab7a-8461be7eb3cf.fbx` | 220,156 bytes | | `93ab10c0b5bf0dbd0d4a1d8a9692269041bfb9ca368d3562bb511bd64c81b7b4` |
| `deer.fbm/deer_basecolor.jpg` | `tripo_rgb_b5566c20-0c44-4e05-94f6-7f557dc49a50.jpg` | 2,484,329 bytes | 4096 × 4096 | `ea1b9cd87942bb88ce507e42709ba30908e8b6e58f97a138cf6907157b950352` |
| `deer.fbm/deer_normal.jpg` | `tripo_normal_f6f06eb5-3405-4c57-bfb5-ae39d5600962.jpg` | 1,410,282 bytes | 4096 × 4096 | `f8c233740489e93066987e60407fdb0be560dc10c98fece26cd03d286bbd41c7` |

The color map paints a warm brown coat with white spots on the back and the shoulders, a cream
chest, belly, muzzle, and inner leg, a cream ring around each eye, pink inner ears, a dark brown
nose, a thin smile line, dark brown hooves, and on each eyeball a brown iris, a black pupil, and a
white light.

### tripo-hand/deer.blend

The hand rig (design 4.4, "Hand rig"). The chain of the body is in `tools/blender/hand/deer/`
(`build.py`, `make_config.py`, `params.json`, `base-config.json`, `redits.py`, `rimport.py`,
`rings.py`), and `pnpm hand-chain deer` runs it (`tools/blender/hand/README.md`). Its scripts are
those of the Tripo pig (`../pig/README.md`) with the eyeballs of the Tripo monkey
(`../monkey/README.md`). `make_config.py` writes `tools/mesh-rigs/simple/deer-tripo.json`: the
joints of the source.

| Item | Value |
|---|---|
| Size | 394,165 bytes |
| SHA-256 | `a90befb9f3fa9247e55881f099fedb3b26afec84ab573bf4320cb17f288c4504` |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the ear tips, the soles at z = 0, the fawn faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `deer`: 3,746 vertices and 3,923 faces (3,425 quads and 498 triangles, 7,348 triangles), flat faces, and the surface of `sa.add_surface()`. No face is gloss: the 48 faces of the nose take the slot `fur` and the color map ("Nose"). The 225 faces of the two eyeballs have the face attribute `eye`, and the 312 faces of the two lids the face attribute `lid`. The UV map of the FBX, and the property `texture` (`assets/models/deer/tripo-hand/deer-color.webp`) |
| Armature | `deer_rig`: the 30 body bones, `tail_tip`, and the 20 arm segments and helpers, at the joints of the config. The Action `bind` holds the seated bind with no bind supination. The properties `palm`, `hinges`, `seat`, and `lids` come from the steps below |
| Facts | `height` 1.166265 (the shoulder joints at 1.802574 m for each unit: 1.3 times the scale of the standing shoulder height of the deer of `deer.rig.glb` at cbc8db5e4, "Size"), `crease` 180, and `seatWidth` 0.57 ("Seat") |
| Eyes | The eyeballs of the mesh, with the finish `varnish` and no eye light (`eyeFinish` of the entry), and a blink lid on each. No eye objects, so the app adds no bead eyes |

The old deer has antlers, so its entry took `headCeiling` 0.87. The fawn has no antlers, and its
ears follow the ear bones, so the hand rig takes no `headCeiling`.

The edits, in the order of the build (`sa` is `tools/blender/studio_armature.py`, x is the x of the
left side):

- **Import.** `sa.import_source('assets/models/deer/tripo-p2/deer.fbx', 1e-5)`. No vertex merges,
  and each face is flat. No loose part goes: the only loose parts are the eyeballs.
- **Arm rings.** Edge ring Subdivide (`bmesh.ops.subdivide_edges(bm, edges=<ring>, cuts=<n>,
  use_grid_fill=True)`) of the clean quad bands of 11 edges between the closed arm loops at x
  0.113, 0.138, 0.162, 0.176, 0.187, 0.197, 0.216, and 0.236: 1 cut on each band, and 2 cuts on the
  two forearm bands from x 0.197. A ring then stands about each 0.3 to 0.5 arm radii.
- **No knee rings.** The leg loops of 11 vertices stop at poles at the knee, so no leg band takes a
  split. Exact knee rows ("Weights" below) take their place.
- **Hoof turned.** The left hoof turns rigidly about the rest forearm axis by one step of the
  closed ring of 11 vertices at x 0.236 (`turn_hooves()` of the build): -32.7 degrees, 220
  vertices. The 11 faces between the ring and the hoof side go, and Bridge Edge Loops joins the
  ring to the turned edge with 11 new quads, which take the UVs of the old band. The right hoof
  does not turn. The hooves keep their form ("Arm twist").
- **Point edits.** Two: the edit `eyes` of the eyeballs and their sockets ("Eyes"), then the edit
  `armStretch` of the arms ("Arm stretch").
- **Surface.** `sa.add_surface(deer, 'deer', <base color>, eye_fans=False,
  config=<deer-tripo.json>)`. The 48 gloss faces are the dark nose in the nose box of the config.
- **Eyes.** The faces of the two eyeballs (the loose parts of 30 to 199 vertices in the eye box)
  take the face attribute `eye`, and keep the color map.
- **Armature.** The joints of the config: the shoulder at x 0.095, the elbow at x 0.214, the
  wrist at x 0.3256, where the pastern widens, the knuckles at x 0.3924, where the two toes part
  (x 0.175, 0.25, and 0.315 in the source, moved by the arm stretch), the hip
  at (0.055, 0.33, -0.03), the knee at (0.054, 0.245, -0.052), and the ankle at (0.064, 0.055,
  -0.045). The palm is the true palm of the source, the mean normal of the hoof faces that face
  down, (0.159, -0.987, -0.034), turned by the hoof turn. The bind arms (`bindArms`) and the trunk
  (`open` 1) are those of the deer of `deer.rig.glb` at cbc8db5e4. Each elbow axis turns about the bind upper
  arm (`hingeTurn`): 81 degrees on the left and -63 degrees on the right ("Arm twist"). The
  thighs slope 25 degrees down and 15 degrees out, and the shins lean 35 degrees forward ("Seat"). The tail
  bones keep the directions of the source in the bind.

The weights, in the rest pose:

1. Automatic Weights, then Limit Total 4 and Normalize All, on a copy of the mesh with no tail and
   no eyeball.
2. Arm rows: each vertex of a side with |x| from 0.095, within 0.05 units of the line of the rest
   arm (0.06 units past the wrist), takes one exact row (`sa.set_weight_row()`): a clavicle share
   from 0.4 at x 0.095 to 0 at x 0.13, an elbow helper share that grows from 0 at x 0.13 to 1 at the elbow joint (x 0.175) and
   falls to 0 at x 0.22, and the rest on the 4 roll segments. These x are places of the
   source: a vertex of the stretched arm takes the row of its place before the stretch. With the
   helper rows at x 0.155 to 0.195, the right elbow folded 16 faces (folds p95 of
   `pnpm arm-check harpist`, limit 8), and now 8.
3. Wrist rows: the bend share of the hoof grows in 12 equal steps of 0.0025 from 0.03 units before
   the head of `hand_<side>`. Knuckle rows: the toes share grows in 12 equal steps of 0.002 from
   0.015 units before the head of `fingers_<side>`. The rig has no digit bones.
4. Knee rows: each leg vertex within 0.05 units of the knee joint along the line from the hip to
   the ankle, and within 0.06 units of that line, keeps the sum t of its thigh and shin shares and
   splits it as thigh t (1 - k) and shin t k, with k = smoothstep(-0.025, 0.025) of the place past
   the knee joint.
5. Face rows: each vertex above y 0.78 with a head share keeps its ear shares and gives each other
   share to `head` (360 vertices), so that the face does not follow the long neck.
6. The eyeballs and the nose take {`head` 1}. The tail (the flood from its farthest point back
   through z below -0.1 and y below 0.5, 117 vertices) takes {`hips` 1 - a, `tail` a}, with a =
   smoothstep(0, 0.02) of the length of the shortest edge path from the root of the tail.

**Arm stretch.** The point edit `armStretch` (`redits.py` of the session, from the Tripo hippo,
`../hippo/README.md`; params `{"kind": "armStretch", "k": 1.5, "ramp": 0.01, "reach": [0.05,
0.07]}`), after the hoof turn. Each vertex of a side with |x| over the shoulder joint moves along
the line u of the rest arm, from the shoulder joint to the wrist joint (0.155 units), from its
place t on the line to t + 0.5 G(t). G is the integral of a band from 0 to t: a smoothstep from 0
at t -0.01 to 1 at 0.01, 1 to the wrist, and a smoothstep to 0 from 0.01 before the wrist to 0.01
after it. Thus the upper arm and the forearm grow by 1.5, and the hoof moves out by 0.078 units
as one piece, with its size. The move fades from 1 at 0.05 units from the line to 0 at 0.07
units, so that the chest stays. With the harp scale 0.8 and vertical shins, 87 % of the palm
targets of the harp lay within 5 mm with 1.1, 92 % with 1.15, and 96 % with 1.2. The longer arms
let the harp stand to the right of the chest (`HARP_PLACE`), so that the soundbox stays off the
chest. At that place, with the hold of 2026-11-13 (`scratch/deerclip/depth.ts`, each body vertex
in each closed harp part, every 0.1 s of `boulanger-matin`): with 1.2, 98.2 % of the targets lay
within 5 mm (worst 8.9 mm), and the right upper arm went more than 1.0 cm into the neck of the
harp in 2.1 % of the play. With 1.3, 100 % lay within 5 mm, and the upper arm went into the neck
in 0.2 %. The harp of 0.975 stands in front of the chest ("Harp fit"), further from the left
shoulder: with the hold of that harp, the paws missed their targets by up to 2.3 cm (94 % within
5 mm) with 1.4, by up to 4.8 cm (76 %) with 1.3, and with 1.5 each target lies within 5 mm. The
arms of 1.5 are 0.69 of the trunk from the hips to the neck (upper arm 21.5 cm, forearm 20.2 cm),
against 0.54 for the Tripo wolf, 0.60 for the cat, and 0.52 to 0.65 for the other hand bodies
(`scratch/da/armlen.ts` of the round 2026-11-13).

**Smooth surface.** No relax and no region colors. The crease angle 180 gives each corner the mean
normal of the faces at its vertex, as the smooth shading of an FBX viewer.

**Nose.** At the end of the build, the 48 gloss faces of the dark nose go to the slot `fur`
(`noseFur` of the params). Thus the nose takes the color map, with its painted nostrils, and the
smooth normals of the fur. The weights do not change.

**Eyes.** At the size of the source, each eye opening was about 0.18 of the head width at the eye
line in the front view of the test page, above the limit of about 0.14 of the other bodies. The
point edit `eyes` (`{"scale": 0.8, "rBall": 0.0217, "rIn": 0.027, "rOut": 0.045, "mid": 0.012,
"zKeep": 0.15}` about the middle of each ball) scales each eyeball and its socket by 0.8. The share
falls by a smoothstep to 0 from 0.027 to 0.045 units from the middle of the ball, so the face
around the socket keeps its form. The largest move is 0.0056 units (1.3 cm). Now the opening is
about 0.14 to 0.16 of the head width (0.16 at 0.85, and 0.14 at 0.75). The eyes keep the iris
place and the iris paint of the source. From the test page and the default hall camera, the gaze
reads as a look ahead, no white shows above the iris, and the eyes do not cross, so no iris moves.
The map paints a light on each eyeball, so the eyes take the finish `varnish` and no eye light,
which gives one light in each eye. The source paints a thin smile line, and the face reads happy,
so the mouth takes no edit.

**Lids.** A lid on each eye: 14 × 13 points from psi -45 to 40 degrees and lam from -58 to 70
degrees on the left (the mirror on the right), with the lower strip as the first row, at 1.17 ball
radii. 156 quads on each side, held turned up 126 degrees into the head. The property `lids` holds
the angle 2.199115 and the hinge axes. The lid faces take the brown fur patch at UV (0.078,
0.352) at 0.97 UV for each unit, and the row `head` 1. In the 21 steps of the blink no open lid
point, side edge, or back edge leaves the head (ray casts), and the open lid lies at least 0.017
units under it. With psi from -55 degrees, up to 14 points of the closing lid left the head.

**Size.** The scale is 1.802574 m for each unit (`metersPerUnit` of the config): 1.3 times the
scale 1.386595 at which the standing shoulder joints are at the height of the deer of
`deer.rig.glb` at cbc8db5e4. At 1.3, the seated crown with no ears is at the seated crown of the Tripo wolf
(`scratch/deersize/measure.py` on each `.blend`, the bones of each studio module):

| Measure (m) | Fawn at 1.0 | Fawn at 1.3 | Tripo wolf |
|---|---|---|---|
| Head height H | 0.221 | 0.287 | 0.369 |
| Standing crown, no ears | 1.292 | 1.680 | 1.664 |
| Standing ear tips | 1.387 | 1.803 | 1.774 |
| Seated crown, no ears | 1.179 | 1.533 | 1.539 |
| Seated shoulder joints | 0.784 | 1.019 | 0.996 |
| Chest width | 0.231 | 0.300 | 0.381 |
| Seat height | 0.271 | 0.352 | 0.276 |

The trunk of the fawn is slim: a scale that matches the chest width of the wolf (1.65) puts the
seated crown 0.4 m above the seated crown of the wolf.

**Seat.** The thighs slope 25 degrees down and 15 degrees out in the bind, the shins lean 35
degrees forward, and the hooves stand flat on the floor (`tools/rig/leg_turns.py <config> 25 15 35
0`). The property `seat` is {`prop` `chair`, `front` -0.0031, `back` -0.12, `halfWidth` 0.13}: the
front lies 0.05 units behind the knee joint of the bind, and 35 % of the thigh lies on the seat.
The seat height is 0.352 m, with the legs of the source. The stool is 0.57 m wide (`seatWidth`),
1.3 times the stool of the old deer, and holds the haunch (0.43 m). At the scale of the shoulders
of the old deer ("Size"), the seat height was 0.271 m (0.243 m on the old deer), and the layout of
the demos against main (`boulanger-matin`, the only demo with the harp, 42 players) was:

| Shins forward | Seat height | Players that move |
|---|---|---|
| 0 degrees | 0.318 m | 9 |
| 20 degrees | 0.302 m | 3 |
| 30 degrees | 0.283 m | 0 |
| 35 degrees | 0.271 m | 0 |

The harp of 0.975 in front of the chest has a larger footprint, and it moves players of
`boulanger-matin` (`scratch/da/layout.ts` of the round 2026-11-13): the deer 0.46 m, the fox
violinist of seat 7 0.54 m, the contrabass 0.72 m, the small percussion 0.72 m, and the flutes,
the oboes, the clarinet, the horns, and the cymbals 0.1 to 0.2 m. At the scale 1.3, the larger body and harp move one
player of `boulanger-matin`: the pig hornist, 0.43 m (`scratch/deersize/layout.ts`). The
short tail hangs behind the back edge of the seat: no tail corner lies in the stool in the play
(`pnpm pose-depth harpist --where tail1`).

**Arm twist.** The roll of each upper arm and the twist of each forearm, in degrees, in each moment
of the harp hold (`HANDS_HOLDS.harp` of `src/pose/hands.ts`, `pnpm pose-preview harpist`, with
`PROBE_NO_CACHE=1`):

| Moment | Left upper arm | Left forearm | Right upper arm | Right forearm |
|---|---|---|---|---|
| chord | -3.2 | -16.4 | -38.1 | 42.1 |
| pluck | -3.6 | -28.8 | -33.4 | 40.1 |
| rest | -16.1 | 42.4 | -58.9 | 41.5 |
| lift50 | -7.1 | 36.9 | -47.1 | 33.4 |
| lower50 | -5.2 | 31.0 | -44.6 | 33.5 |

With the hooves and the elbow axes of the source, the upper arms rolled 51 to 66 degrees and the
forearms twisted up to -67 and 96 degrees. The elbow axis turns move the roll from the upper arms
to the forearms, the left hoof turn centers the left forearm, and the right palm turns a little
back to the player in the play (`faceR`) and a little to the right at rest (`restR`). The
forward right rest elbow (`restR.pole`) rolls the right upper arm 58 to 59 degrees at rest, with
the arms of 1.2 and of 1.3 times the source. The left forearm spreads 59 degrees from the chord
to the rest, so no hoof step of 32.7 degrees centers it better.

**Harp fit.** The harp is 0.975 of the concert harp of the app (`harpScale`, 1.27 m high). Its
base stands 0.23 m in front of the floor point at the scale 1 and 0.25 H to the left of it,
turned 46 degrees (`HARP_PLACE`), and the top of its soundbox and the end of its neck are slim
(`SOUNDBOX`, `NECK` of `src/models/instruments/harp.ts`). The top of the soundbox rests against
the chest, in front of and below the right shoulder, and the right arm passes outside it with the
elbow up. The last table of this section gives the fit of the harp of 0.975 (round
2026-11-13, `reports/2026-11-13-deer-arms/`). The table before it gives the fit of the harp of
0.85 at the right of the chest. The other measures come from the harp 0.75 of
the fit at 1/1.3 of the size ("Size") and from the harp 0.975. The left hand plays up to D4
(`reach.leftHighest` 62 of the harp hold), and the spine stays erect (`lean` 0). Against the old
deer and the first fawn (H of the old deer, no arm stretch, harp scale 1.3), from
`pnpm pose-depth harpist --gaps`, `pnpm hold-fit harpist`, and `pnpm arm-check harpist`
(columns 2 to 4, with the base `204632d8d`), and from `pnpm pose-depth harpist` and
`pnpm hold-fit harpist` (column 5, the arms of 1.3 times the source and the harp 0.975; the arm
gate did not run):

| Measure | Old deer | First fawn | Fawn, arms 1.2 | Fawn, arms 1.3 |
| --- | --- | --- | --- | --- |
| Palm targets within 5 mm | 100 % | 48 % | 98 % | 100 % |
| Worst palm target | 0 cm | 31 cm | 1.5 cm | 0 cm |
| Paws in the body in the play | 1.0 cm | 0.9 cm | 3.4 cm | 1.4 cm |
| Forearms in the body in the play | 0.8 cm | 4.4 cm | 2.5 cm | 0.2 cm |
| Upper arms in the body in the play | 1.6 cm | 4.9 cm | 3.0 cm | 2.4 cm |
| Upper arms in the harp in the play | 2.4 cm | 4.0 cm | 2.0 cm | 1.0 cm |
| Upper arms in the body at rest | 0.8 cm | 3.3 cm | 2.2 cm | 1.7 cm |
| Gap of the head to the harp in the play | | 2.3 cm | 2.8 cm | |
| Folds p95, left and right (limit 8) | 2, 6 | 1, 8 | 6, 8 | |
| Twist p95, left and right (limit 55) | 28, 30 | 6, 9 | 12, 12 | |
| Paw swing p95, left and right (limit 70) | 68, 41 | 68, 33 | 66, 32 | |
| Stretch p95, left and right (limit 0.35) | 0.04, 0.06 | 0.11, 0.10 | 0.09, 0.12 | |

Each body vertex in each closed harp part, every 0.1 s of `boulanger-matin`
(`scratch/deerclip/depth.ts`): with the arms of 1.3 and the harp of 2026-11-13, no region goes
more than 1.0 cm into the soundbox, the column, the neck, the base, the pedals, or the stool in
more than 1 % of the samples of the play, the lift, the rest, or the lowering. The right upper
arm goes up to 1.1 cm into the top of the soundbox (0.5 % of the play) and 1.0 cm into the neck
(0.2 %), the left shin 1.8 cm into the stool (0.7 %), and the right hoof 1.9 cm into the base
(0.8 %), both in pedal moves. With the arms of 1.2 and the old harp, the right side of the chest
went 2.4 to 2.7 cm into the soundbox in each sample. The long ears and the neck stay off the
harp, and no hoof goes more than 0.6 cm into the frame of the harp (`claws in harp` of
`pnpm pose-depth harpist`).

The fit of 2026-11-13 (`scratch/dh/evalc.ts` and `scratch/dh/plane.ts` of the round, every 0.5 s
or 0.1 s of `boulanger-matin` with the lift, the rest, and the lowering; `pnpm body-clip`,
`pnpm hold-fit`, `pnpm arm-check harpist --base 6dcadfb9e`). The angle of an elbow is 180 degrees
when the arm is straight.

| Measure | Harp 0.975 | Harp 0.85 and its hold |
| --- | --- | --- |
| Right elbow angle, p5 and p50 | 57, 75 degrees | 99, 103 degrees |
| Right upper arm out from the trunk, p50 and p95 | 46, 72 degrees | 33, 44 degrees |
| Left elbow angle, p5 and p50 | 75, 86 degrees | 76, 86 degrees |
| Fingers through the strings, left and right | 6.7, 4.7 cm | 1.9, 1.7 cm |
| Paws past the strings by more than 1 cm, left and right | 79, 83 % | 2.4, 2.9 % |
| Arm parts through the frame of the strings | 0 % | 0 % |
| Palm targets within 5 mm | 100 % | 100 % |
| Deepest region in a harp part or the stool (limit 1.3 cm) | 2.4 cm, right hoof in the base | 1.3 cm, left shin in the stool |
| Clips of `pnpm body-clip harpist` | 5 | 0 |
| Folds p95, left and right (limit 8) | 4, 5 | 6, 2 |
| Paw swing p95, left and right (limit 70) | 66, 27 | 67, 27 |
| Right grip turn p50 (limit 45) | 11 | 40 |

The fit of the harp of 0.975 in front of the chest, with the arms of 1.5 (`scratch/dh/evalc.ts`
of the round 2026-11-13, every 0.5 s of `boulanger-matin` with the lift, the rest, and the
lowering; `pnpm body-clip harpist`; `pnpm arm-check harpist --base 19f45196b`). At the place of
the harp of 0.85, from the scale 0.875, the right upper arm went through the plane of the
strings, inside their frame, in 90 % of the samples.

| Measure | Harp 0.85, arms 1.3 | Harp 0.975, arms 1.5 |
| --- | --- | --- |
| Right elbow angle, p5 of the play | 99 degrees | 96 degrees |
| Left elbow angle, p5 of the play | 76 degrees | 79 degrees |
| Right upper arm out from the trunk, p50 | 33 degrees | 18 degrees |
| Fingers through the strings, left and right | 1.9, 1.7 cm | 0, 0 cm |
| Arm surface through the frame of the strings | 1.5 cm | 0 cm |
| Palm targets within 5 mm | 100 % (2.4 mm) | 100 % (4.1 mm) |
| Clips of `pnpm body-clip harpist` (limit 1.3 cm) | 0 | 4: right hoof in the base 2.6 cm (0.5 %), chest in the neck 1.5 cm (2.1 %), chest in the soundbox 1.3 cm (0.7 %), right upper arm in the neck 1.3 cm (0.0 %) |
| Folds p95, left and right (limit 8) | 4, 0 | 4, 1 |
| Twist p95, left and right (limit 55) | 7, 26 | 20, 36 |
| Paw swing p95, left and right (limit 70) | 67, 27 | 54, 36 |
| Right paw twist p95 at rest (limit 170) | 26 | 82 |
| Right grip turn p50 (limit 45) | 40 | 20 |

**Color map** (`tools/tripo-maps.py deer`). The tool scales the source to 2048 pixels (Lanczos) and
writes WebP quality 60, method 6 (Pillow 13.0.0). No texel changes its color.

**Normal map.** The same run writes `deer-normal.webp` from the normal map of the FBX, as for the
wolf: each x, y tilt limited to 0.2 (3.59 % of the texels), a box scale to 1024 pixels, the tilts
times 4 in red and green, 255 in blue, and `cwebp -q 60 -sharp_yuv -m 6` (libwebp 1.5.0).

**Differences from the source.** The eyeballs and their sockets are at 0.8 of the source, and the
upper arms and the forearms are 1.5 times longer. The app
light is warm and comes from above, so the brown coat reads lighter and more orange than in the
even gray light of an FBX viewer, and the long neck shades darker under the chin. The seated bind
and the hold bend the arms and the legs.

The export of the file and the maps. License of each file: CC BY-NC 4.0, as the FBX file.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/deer.rig.glb` | 1,245,332 bytes | `490abdd58d6ccf3281f107870b3b294ac211c1bede1a5102a25e3dd4140dbd3d` |
| `tripo-hand/deer.rig.json` | 19,344 bytes | `4b3de397707a41e60550bb40ccb7cd37ad9463249fc48cea1e67587f8efd3594` |
| `tripo-hand/deer-color.webp` | 133,838 bytes, 2048 × 2048 | `9f40f146e7a1f5ea11a8139d90682db82a8ace321451b96b30200236b9cb6876` |
| `tripo-hand/deer-normal.webp` | 75,080 bytes, 1024 × 1024 | `3607beb00dcf3ec1e5d061d975efd4a221ef12dc63c378ab6e7058439928e538` |
