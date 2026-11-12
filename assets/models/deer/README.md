# Deer model

This folder holds the source mesh of the old deer, a copy with rebuilt arms and its weights, a copy
of that with no fold on the inner side of the arm roots, and the rigged copy. The app does not
serve these files. It loads the module `src/models/studio/deer.ts`, which the hand rig of the
Tripo fawn now writes ("Tripo hand rig" below). Before that hand rig, this chain wrote it:

```text
deer.glb                           source mesh
   │  tools/blender/deer_arms.py   rebuilt arms and painted weights
   v
deer-arms.glb + deer-weights.json  `paintedWeights` of tools/mesh-rigs/deer.json
   │  point edits in Blender         no fold at the inner arm roots (deer-arms-crease.json)
   v
deer-arms-crease.glb               `source` of tools/mesh-rigs/deer.json
   │  pnpm rig-mesh deer
   v
deer.rig.glb                       rigged mesh
   │  pnpm studio-body deer
   v
src/models/studio/deer.ts          studio body of the app
```

`docs/agents/rigging.md` gives the steps of the chain.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `deer.glb` | Source mesh (below) | None |
| `deer-arms.glb` | Copy of `deer.glb` with rebuilt arms. License as `deer.glb` | `deer_arms.py` |
| `deer-weights.json` | Weights of the same Blender run. License as `deer.glb` | `deer_arms.py` |
| `deer-arms-crease.glb` | Copy of `deer-arms.glb` with no fold on the inner side of the arm roots. License as `deer.glb` | None: point edits in Blender (below) |
| `deer-arms-crease.json` | The list of the edits of `deer-arms-crease.glb`. License as `deer.glb` | None |
| `deer.rig.glb` | Output of the rig. License as `deer.glb` | `pnpm rig-mesh deer` |

## deer.glb

| Item | Value |
|---|---|
| Size | 16,557,936 bytes |
| SHA-256 | `1066a9f8f0a66cbe8926d67d2abaa09217e2f7872bbe970cc3cf5328491c396a` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Khronos glTF Blender I/O v4.3.47 |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,140 triangles and 4,717 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |
| Material | One material `BakedMaterial`, double-sided, with a base color texture (10.6 MB) and a metallic-roughness texture (5.8 MB), each a PNG |

The values below are in the units of the studio: 1 unit from the soles to the highest point, the
soles at y = 0, +z forward, and +x the left side of the animal. The mesh faces +z. The weld is at
1e-5.

- The weld gives 1,573 vertices in one part. 4 edges are open and 2 edges have more than two
  faces. 227 faces have a corner angle below 10°.
- The box is x -0.196 to 0.196, y 0 to 1, and z -0.173 to 0.173. The deer is 1.9024 units of the
  file high from the soles to the tips of the antlers. The skull top between the antlers is at
  y 0.852.
- The deer stands upright on short legs with dark hooves, with the crotch at y 0.245. The short
  arms hang down beside the body, apart from it below y 0.49, with dark hooves for hands down to
  y 0.285.
- The small dark nose is at z 0.173 and y 0.722. The puff tail is at y 0.29 to 0.41. The large
  ears stand out at x 0.12 to 0.19, and two antlers rise from the top of the head to y 1.

## deer-arms.glb and deer-weights.json

| Item | Value |
|---|---|
| `deer-arms.glb` | 1,003,056 bytes, SHA-256 `9e358b89a4fef024aee6d8b6a5d6489fbde450f5994e3b1de7318a48aed038e5` |
| `deer-weights.json` | 457,068 bytes, SHA-256 `d1bd654e29d2a01b3f922ba69677f434b64f8da481ab0fbc0cc07cc3d650e874` |
| Writer | Khronos glTF Blender I/O v5.2.40, from an import of `deer.glb` |

Each upper arm of the source joins the side of the trunk down to near the elbow. The script cuts
each arm along the seam where it meets the trunk and under a cap plane at the shoulder. It fills a
side wall of the trunk under the arm. It replaces the faces of the arm from the socket to the
wrist with a quad tube that has a flat inner side on the wall. The arms are 1.25 times longer than
the arms of the source. The faces of the paws, the trunk, the legs, and the head are the faces of
the source. The arm image lies in a strip on top of the atlas, a JPEG at the quality 92. The copy
has 4,152 triangles. A run gives the same bytes:

```bash
blender -b --factory-startup -P tools/blender/deer_arms.py
shasum -a 256 assets/models/deer/*.glb assets/models/deer/deer-weights.json
```

## deer-arms-crease.glb

| Item | Value |
|---|---|
| Size | 1,001,772 bytes |
| SHA-256 | `23f46cdc03936985a20e8aef900804c41b02f41a08d9d06a24e4ae5bf0d7b5ff` |
| Writer | Khronos glTF Blender I/O v5.2.40 |

On the inner side of each upper arm of `deer-arms.glb`, below the root, the surface of the arm
went up to a chain of short edges at y 0.505 and folded back down to y 0.47: a thin fin about
0.035 units tall, with a slit on each side of it, from z -0.03 to z 0.03. In the bind it showed as
thin fins under the front of each root and as deep slits on the inner side of the upper arm.

The copy removes each fold with point edits in the live Blender on the welded mesh. Each edit
merges one vertex into a neighbor vertex at the place of that neighbor, so that no vertex goes to
a new place. `deer-arms-crease.json` lists the 27 merges in their order:

1. Each vertex of the chain merges into its nearest neighbor of the row below it on the arm: 9 on
   the left and 10 on the right.
2. Each vertex of that row (but the back one) merges into its neighbor at the foot of the fold:
   4 on each side.

The arm surface now goes from the arm to the side wall of `deer_arms.py` with no fin. A shallow
crease about 0.01 units deep stays where the wall meets the arm, and a fold of the trunk wall at
x 0.077, y 0.49 to 0.52 stays: a merge there made the fold sharper, so the copy keeps it. Each
merge moves a corner at most 0.024 units. The copy has 2,052 vertices and 4,098 triangles after
the weld (2,079 and 4,152 before): 54 faces go, and each other face keeps the UVs of its own
corners. Each merged corner takes the weight row of its new vertex in `deer-weights.json`.

## deer.rig.glb

| Item | Value |
|---|---|
| Size | 595,160 bytes |
| SHA-256 | `40f89619333d71b6eda4df1a5ebd0ac3ee85ea975287db2a0d23d9c3386b17e2` |
| Bind | The role-neutral bind (design 4.4): the arms of the source, straight (`studio.straightArms` of the config), with the elbow axes of the old bent bind (`studio.bindArms`), and the bind paws supinated so that the largest paw twist of the roles of the cast matrix and the harp is smallest (`studio.bindSupination`) |
| Shapes | The arm-down shape of each arm, the straight legs of each side, and a `raise` shape of the bent right elbow of the harp hold |
| Thumbs | A bone `thumb_L` and `thumb_R` on the free thumb of each paw (`thumbs` of the config, below) |

A run of `pnpm rig-mesh deer` gives the same bytes. The arms have a side wall of the trunk under
each root (`deer_arms.py`). The deer plays a smaller harp (`harpScale`), which leans on its right
shoulder.

### Thumbs

Each paw of the source is one closed fist. Three finger lobes curl into the palm and join side by
side over their full length, so one `fingers` bone holds them. A short thumb stub on the front edge
of each paw is free of the fist from about y 0.28 down to its tip at y 0.267. Point edits that
split the lobes would change the form, so only the thumb takes a bone of its own.

The vertices of each stub were chosen by hand in Blender on the welded source (the weld and the
order of `load_mesh()` of `rig_mesh.py`). They are the vertices below the gap that frees the stub:

| Side | Free vertices | Root ring (keeps its rows) |
|---|---|---|
| L | 811, 812, 815, 817, 820, 823, 827, 841, 842, 843 | 809, 810, 814, 816, 821, 822, 826 |
| R | 1039, 1040, 1041, 1046, 1047, 1049, 1050, 1051, 1053 | 1033, 1034, 1038, 1042, 1045, 1048, 1052 |

Each free vertex gives its share of the paw (`hand`, about 0.67 to 0.81) to the thumb, and keeps its
shares of the fingers, the wrist helper, and the last forearm segment. The thumb is a child of the
paw and turns with it, so a pose with no thumb bend skins each vertex as before. The vertices of the
root ring already have four bones each, so the root has no ring of half shares. The thumb head is
the middle of the root ring, and its tail the middle of the three lowest free vertices. A turn
about the close axis moves the thumb tip back across the inner face of the paw.

## Tripo hand rig

`tripo-hand/` holds the body of the harpist: a hand rig of the Tripo P2 fawn `tripo-p2/deer.fbx`,
made by one build script in a headless Blender 5.2, by the route of the Tripo wolf
(`../wolf/README.md`, "Candidate hand rig"). The body keeps the form, the colors, and the eye paint
of the source. Two point edits change the form: the eyeballs and their sockets are smaller
("Eyes"), and the upper arms and the forearms are 1.3 times longer ("Arm stretch"). No point edit
changes the head, the ears, the trunk, the hooves, the legs, or the tail. The arms have no cut and
no split from the trunk. The `ANIMALS` entry of the deer
points to `tripo-hand/deer.rig.glb`. The files of the old deer above do not change.

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/deer.fbx`, `tripo-p2/deer.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |
| `tripo-hand/deer.blend` | Made from `tripo-p2/deer.fbx` by the scripted edits below. License as the FBX file | The scripted edits below |
| `tripo-hand/deer.rig.glb` | Export of `tripo-hand/deer.blend`. License as the FBX file | `pnpm rig-export deer --blend assets/models/deer/tripo-hand/deer.blend --out assets/models/deer/tripo-hand/deer.rig.glb` |
| `tripo-hand/deer.rig.json` | Text summary of the export, for diffs | The same run |
| `tripo-hand/deer-color.webp`, `tripo-hand/deer-normal.webp` | Web copies of the color map and the normal map of the FBX ("Color map" and "Normal map" below). License as the FBX file | `uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/deer-maps.py` |

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

The hand rig (design 4.4, "Hand rig"). The scripts of the session (`scratch/deer/` of the worktree,
which git ignores: `build.py`, `make_config.py`, `base-config.json`, `params.json`, and
`chain-here.sh`) are not in the repo. They are the scripts of the Tripo pig (`../pig/README.md`)
with the eyeballs of the Tripo monkey (`../monkey/README.md`). `make_config.py` writes
`tools/mesh-rigs/simple/deer-tripo.json`: the joints of the source.

| Item | Value |
|---|---|
| Size | 393,383 bytes |
| SHA-256 | `2a5f72e6de46b2916b0d14c2671ac9b44e4ce337af8afe02b1feba4da9079dc0` |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the ear tips, the soles at z = 0, the fawn faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `deer`: 3,746 vertices and 3,923 faces (3,425 quads and 498 triangles, 7,348 triangles), flat faces, and the surface of `sa.add_surface()`. No face is gloss: the 48 faces of the nose take the slot `fur` and the color map ("Nose"). The 225 faces of the two eyeballs have the face attribute `eye`, and the 312 faces of the two lids the face attribute `lid`. The UV map of the FBX, and the property `texture` (`assets/models/deer/tripo-hand/deer-color.webp`) |
| Armature | `deer_rig`: the 30 body bones, `tail_tip`, and the 20 arm segments and helpers, at the joints of the config. The Action `bind` holds the seated bind with no bind supination. The properties `palm`, `hinges`, `seat`, and `lids` come from the steps below |
| Facts | `height` 0.897127 (the shoulder joints at 1.386595 m for each unit, the standing shoulder height of the deer of `deer.rig.glb`), `crease` 180, and `seatWidth` 0.44 ("Seat") |
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
- **Armature.** The joints of the config: the shoulder at x 0.095, the elbow at x 0.1984, the
  wrist at x 0.2954, where the pastern widens, the knuckles at x 0.3617, where the two toes part
  (x 0.175, 0.25, and 0.315 in the source, moved by the arm stretch), the hip
  at (0.055, 0.33, -0.03), the knee at (0.054, 0.245, -0.052), and the ankle at (0.064, 0.055,
  -0.045). The palm is the true palm of the source, the mean normal of the hoof faces that face
  down, (0.159, -0.987, -0.034), turned by the hoof turn. The bind arms (`bindArms`) and the trunk
  (`open` 1) are those of the deer of `deer.rig.glb`. Each elbow axis turns about the bind upper
  arm (`hingeTurn`): 81 degrees on the left and -63 degrees on the right ("Arm twist"). The
  thighs slope 25 degrees down and 15 degrees out, and the shins lean 35 degrees forward ("Seat"). The tail
  bones keep the directions of the source in the bind.

The weights, in the rest pose:

1. Automatic Weights, then Limit Total 4 and Normalize All, on a copy of the mesh with no tail and
   no eyeball.
2. Arm rows: each vertex of a side with |x| from 0.095, within 0.05 units of the line of the rest
   arm (0.06 units past the wrist), takes one exact row (`sa.set_weight_row()`): a clavicle share
   from 0.4 at x 0.095 to 0 at x 0.13, an elbow helper share of 0.25, 0.75, 0.75, and 0.25 at x
   0.14, 0.158, 0.192, and 0.21, and the rest on the 4 roll segments. These x are places of the
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
`../hippo/README.md`; params `{"kind": "armStretch", "k": 1.3, "ramp": 0.01, "reach": [0.05,
0.07]}`), after the hoof turn. Each vertex of a side with |x| over the shoulder joint moves along
the line u of the rest arm, from the shoulder joint to the wrist joint (0.155 units), from its
place t on the line to t + 0.3 G(t). G is the integral of a band from 0 to t: a smoothstep from 0
at t -0.01 to 1 at 0.01, 1 to the wrist, and a smoothstep to 0 from 0.01 before the wrist to 0.01
after it. Thus the upper arm and the forearm grow by 1.3, and the hoof moves out by 0.047 units
as one piece, with its size. The move fades from 1 at 0.05 units from the line to 0 at 0.07
units, so that the chest stays. With the harp scale 0.8 and vertical shins, 87 % of the palm
targets of the harp lay within 5 mm with 1.1, 92 % with 1.15, and 96 % with 1.2. The longer arms
let the harp stand to the right of the chest (`HARP_PLACE`), so that the soundbox stays off the
chest. At that place, with the hold of 2026-11-13 (`scratch/deerclip/depth.ts`, each body vertex
in each closed harp part, every 0.1 s of `boulanger-matin`): with 1.2, 98.2 % of the targets lay
within 5 mm (worst 8.9 mm), and the right upper arm went more than 1.0 cm into the neck of the
harp in 2.1 % of the play. With 1.3, 100 % lay within 5 mm, and the upper arm went into the neck
in 0.2 %.

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

**Seat.** The thighs slope 25 degrees down and 15 degrees out in the bind, the shins lean 35
degrees forward, and the hooves stand flat on the floor (`tools/rig/leg_turns.py <config> 25 15 35
0`). The property `seat` is {`prop` `chair`, `front` -0.0031, `back` -0.12, `halfWidth` 0.13}: the
front lies 0.05 units behind the knee joint of the bind, and 35 % of the thigh lies on the seat.
The seat height is 0.271 m (0.243 m on the old deer), with the legs of the source. The stool keeps
the width 0.44 m of the old deer (`seatWidth`), which holds the haunch (0.33 m). The layout of
the demos against main (`boulanger-matin`, the only demo with the harp, 42 players):

| Shins forward | Seat height | Players that move |
|---|---|---|
| 0 degrees | 0.318 m | 9 |
| 20 degrees | 0.302 m | 3 |
| 30 degrees | 0.283 m | 0 |
| 35 degrees | 0.271 m | 0 |

The place of the harp moves no player. The
short tail hangs behind the back edge of the seat: no tail corner lies in the stool in the play
(`pnpm pose-depth harpist --where tail1`).

**Arm twist.** The roll of each upper arm and the twist of each forearm, in degrees, in each moment
of the harp hold (`HANDS_HOLDS.harp` of `src/pose/hands.ts`, `pnpm pose-preview harpist`):

| Moment | Left upper arm | Left forearm | Right upper arm | Right forearm |
|---|---|---|---|---|
| chord | -10.3 | -34.5 | -24.4 | 44.7 |
| pluck | -12.9 | -44.3 | -19.1 | 40.6 |
| rest | -30.1 | 42.5 | 11.7 | -41.5 |
| lift50 | -14.6 | 22.7 | -8.2 | -11.0 |
| lower50 | -9.1 | 12.6 | -16.9 | -0.1 |

With the hooves and the elbow axes of the source, the upper arms rolled 51 to 66 degrees and the
forearms twisted up to -67 and 96 degrees. The elbow axis turns move the roll from the upper arms
to the forearms, the left hoof turn centers the left forearm, and the right rest palm turns a
little to the right (`restR` of the harp hold). The spread of each forearm from the chord to the
rest is about 86 degrees, so no hoof step of 32.7 degrees centers it better.

**Harp fit.** The harp is 0.75 of the concert harp of the app (`harpScale`, 0.98 m high), and its
base stands 0.15 m in front of the floor point at the scale 1, turned 45 degrees (`HARP_PLACE`).
The left hand plays up to D4 (`reach.leftHighest` 62 of the harp hold), and the spine stays
erect (`lean` 0). Against the old deer (`pnpm pose-depth harpist --gaps --base 204632d8d`,
`pnpm hold-fit harpist --base 204632d8d`, `pnpm arm-check harpist --base 204632d8d`), and against
the first fawn (H of the old deer, no arm stretch, harp scale 1.3):

| Measure | Old deer | First fawn | Fawn |
|---|---|---|---|
| Palm targets within 5 mm | 100 % | 48 % | 98 % |
| Worst palm target | 0 cm | 31 cm | 1.5 cm |
| Paws in the body in the play | 1.0 cm | 0.9 cm | 3.4 cm |
| Forearms in the body in the play | 0.8 cm | 4.4 cm | 2.5 cm |
| Upper arms in the body in the play | 1.6 cm | 4.9 cm | 3.0 cm |
| Upper arms in the harp in the play | 2.4 cm | 4.0 cm | 2.0 cm |
| Upper arms in the body at rest | 0.8 cm | 3.3 cm | 2.2 cm |
| Gap of the head to the harp in the play | | 2.3 cm | 2.8 cm |
| Folds p95, left and right (limit 8) | 2, 6 | 1, 8 | 6, 8 |
| Twist p95, left and right (limit 55) | 28, 30 | 6, 9 | 12, 12 |
| Paw swing p95, left and right (limit 70) | 68, 41 | 68, 33 | 66, 32 |
| Stretch p95, left and right (limit 0.35) | 0.04, 0.06 | 0.11, 0.10 | 0.09, 0.12 |

The left paw goes 3.4 cm into the chest at a high note of the left hand, and the right upper arm
goes 2.2 cm to 3.0 cm into the root of the arm, also at rest. With the base 0.12 m away, each
target was within 5 mm, but the left paw went 5.8 cm into the chest. A harp of 0.8 touched the
chin. With the harp scale 0.8 and the limit G4 for the left hand, the left paw went 6.2 cm into
the chest. Each hoof
meets its string with its toe tips, and no hoof goes more than 0.6 cm into the strings or the
column. The long ears and the neck stay off the harp.

**Color map** (`tools/deer-maps.py`). The tool scales the source to 2048 pixels (Lanczos) and writes
WebP quality 60, method 6 (Pillow 13.0.0). No texel changes its color.

**Normal map.** The same run writes `deer-normal.webp` from the normal map of the FBX, as for the
wolf: each x, y tilt limited to 0.2 (3.59 % of the texels), a box scale to 1024 pixels, the tilts
times 4 in red and green, 255 in blue, and `cwebp -q 60 -sharp_yuv -m 6` (libwebp 1.5.0).

**Differences from the source.** The eyeballs and their sockets are at 0.8 of the source, and the
upper arms and the forearms are 1.3 times longer. The app
light is warm and comes from above, so the brown coat reads lighter and more orange than in the
even gray light of an FBX viewer, and the long neck shades darker under the chin. The seated bind
and the hold bend the arms and the legs.

The export of the file and the maps. License of each file: CC BY-NC 4.0, as the FBX file.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/deer.rig.glb` | 1,245,312 bytes | `0d7b2623e817d60d359645a873fdf0ce1ec2986f8758e2d9d3073c3a7b2cd658` |
| `tripo-hand/deer.rig.json` | 19,351 bytes | `9053ccd978036ffbd175020ea83950d092fc4334619cc3a507b9478db5eb6c11` |
| `tripo-hand/deer-color.webp` | 133,838 bytes, 2048 × 2048 | `9f40f146e7a1f5ea11a8139d90682db82a8ace321451b96b30200236b9cb6876` |
| `tripo-hand/deer-normal.webp` | 75,080 bytes, 1024 × 1024 | `3607beb00dcf3ec1e5d061d975efd4a221ef12dc63c378ab6e7058439928e538` |
