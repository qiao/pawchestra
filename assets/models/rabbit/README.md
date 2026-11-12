# Rabbit model

This folder holds the A-pose source mesh of the rabbit, a copy with rebuilt arms and its weights,
and the rigged copy. The app does not serve these files. It loads the module
`src/models/studio/rabbit.ts`, which this chain writes:

```text
rabbit-apose.glb                          source mesh
   │  violin_arms.py rabbit (e491ff3c)    rebuilt arms and painted weights
   v
rabbit-arms.glb + rabbit-weights.json     `source` and `paintedWeights` of the config
   │  pnpm rig-mesh rabbit                config tools/mesh-rigs/rabbit.json
   v
rabbit-apose.rig.glb                      rigged mesh
   │  pnpm studio-body rabbit
   v
src/models/studio/rabbit.ts               studio body of the app
```

This is the body that production shows. `docs/agents/rigging.md` gives the steps of the chain.

The folder also holds the files of trials that the app does not use ("Trial files" below): the
hand rig of 2026-11-04 and 2026-11-05 from a Tripo mesh (`hand-rig/`, `tripo/`), and the T-pose
mesh of an earlier body (`rabbit-tpose.glb`). The hand rig is rejected: it gave a thin, faceted
arm root and other faults. Its `.blend` lies in `hand-rig/`, so that no tool finds it beside the
GLB file of the app (`handRigOf()` of `tools/glb-swap.ts`), and `pnpm rig-mesh rabbit` runs.

`tripo-hand/` holds a hand rig ("tripo-hand/rabbit.blend" below) of the third Tripo P2 mesh
`tripo-p2/rabbit.fbx`, made in headless Blender by the route of the Tripo wolf: the form, the
colors, and the eye paint of the source, with no arm cut and no stretch.
On the branch of the candidate, the `ANIMALS` entry of the rabbit points to
`tripo-hand/rabbit.rig.glb`.

## Files

The app chain:

| File | Origin | Rebuild |
|---|---|---|
| `rabbit-apose.glb` | Source mesh (below) | None |
| `rabbit-arms.glb` | Copy of the source with rebuilt arms. License as the source | `violin_arms.py rabbit` of e491ff3c |
| `rabbit-weights.json` | Weights of the same Blender run. License as the source | `violin_arms.py rabbit` of e491ff3c |
| `rabbit-apose.rig.glb` | Output of the rig. License as the source | `pnpm rig-mesh rabbit` |

The trial files, which the app does not use:

| File | Origin | Rebuild |
|---|---|---|
| `rabbit-tpose.glb` | T-pose source mesh (below) | None |
| `tripo/rabbit.fbx`, `tripo/rabbit.fbm/` | Source mesh with quad faces, and its four textures (below) | None |
| `hand-rig/rabbit.blend` | Made by hand in Blender from `tripo/rabbit.fbx` (below). License as the FBX file | None: edit it in Blender |
| `hand-rig/rabbit.rig.glb` | Export of `hand-rig/rabbit.blend`. License as the FBX file | `pnpm rig-export rabbit --blend assets/models/rabbit/hand-rig/rabbit.blend --out assets/models/rabbit/hand-rig/rabbit.rig.glb` |
| `hand-rig/rabbit.rig.json` | Text summary of the export, for diffs | The same run |

The candidate hand rig:

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/rabbit.fbx`, `tripo-p2/rabbit.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |
| `tripo-hand/rabbit.blend` | Made in headless Blender 5.2 from `tripo-p2/rabbit.fbx` (below). License as the FBX file | The scripted edits below |
| `tripo-hand/rabbit.rig.glb` | Export of `tripo-hand/rabbit.blend`. License as the FBX file | `pnpm rig-export rabbit --blend assets/models/rabbit/tripo-hand/rabbit.blend --out assets/models/rabbit/tripo-hand/rabbit.rig.glb` |
| `tripo-hand/rabbit.rig.json` | Text summary of the export, for diffs | The same run |
| `tripo-hand/rabbit-color.webp` | Color map of the rabbit, from the color map of the Tripo FBX ("Color map" below). License as the FBX file | `uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/rabbit-maps.py` |
| `tripo-hand/rabbit-normal.webp` | Normal map of the fur, from the normal map of the Tripo FBX ("Normal map" below). License as the FBX file | The same run (cwebp 1.5.0) |

## rabbit-apose.glb

The mesh has no skeleton. The arms are in an A-pose: out, down, and a little forward, apart from
the trunk below the shoulders.

| Item | Value |
|---|---|
| Size | 16,662,596 bytes |
| SHA-256 | `ed1c4778be4ee6ceba54aaf8e92117684551c18c06448e3b4904d2415e56634a` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,118 triangles and 4,327 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |

## rabbit-arms.glb and rabbit-weights.json

| Item | Value |
|---|---|
| `rabbit-arms.glb` | 1,066,280 bytes, SHA-256 `3a8d60065ea5679e331fc16e106e74e3f68546654b83176a55dba878e2554245` |
| Mesh | 2,084 vertices after a weld at 1e-5, 4,154 triangles: on each arm a tube of 15 rings of 16 vertices, joined to the trunk and the paw with Bridge Edge Loops, with Beautify Faces on the bridge triangles |
| Material | One material with one base color JPEG of 4096 × 4608 pixels: the atlas of the source, and a strip of 512 pixels on top with the fur color of the source arms, baked onto the new faces. No metallic-roughness texture |
| `rabbit-weights.json` | 460,502 bytes, SHA-256 `e257527785da440da83161e07fce7e3700bebaeaa527a6dec2ad88d072d99969` |
| Weights | The automatic weights of Blender with the Weight Paint fixes of the script, on the studio bones and the arm segments and helpers (`armSegments` of the config), for `paintedWeights` of the config |

The script puts new quad faces on each arm from the shoulder line to the wrist. The faces of the
paws, the trunk, the legs, and the head are the faces of the source. The new arm surface lies on
the old one. The arms are 1.15 times longer from the shoulder line, a little longer than the arms
of the source. The copy gives them this length, because a rig with arm segments does not stretch
the arms. The run of `tools/blender/violin_arms.py -- rabbit` at e491ff3c made them. The script of
today has no entry of the rabbit (d46b8997), so the git history keeps the run.

The rig gives the faces near each shoulder joint and each elbow joint the normals of the skin with
no crease angle (`rootNormals` of the config). The seated bind raises the hanging arms, and each
hold bends the elbows. A crease angle there splits the normals, and the split shows as a slit at the
front of each arm root.

## rabbit-apose.rig.glb

| Item | Value |
|---|---|
| Size | 804,132 bytes |
| SHA-256 | `cfc3fe4485e0917e049bad6024de04d73d5bf6e2e8a76d48c7b1047d17fe6785` |
| Bind | The role-neutral bind (design 4.4): the arms of the source, straight (`studio.straightArms` of the config), with the elbow axes of the old bent bind of the violin hold (`studio.bindArms`), and the bind paws supinated so that the largest paw twist of the roles of the cast matrix is smallest (`studio.bindSupination`) |
| Shapes | The arm-down shape of each arm, the straight legs of each side, and a `raise` shape of the bent left elbow |

A run of `pnpm rig-mesh rabbit` gives the same bytes.

## Trial files

These files are the trials of 2026-11-03 to 2026-11-05: `rabbit-tpose.glb`, the source of the
T-pose body of `pnpm rig-mesh rabbit` at 77b9d9d3, and the hand rig of the Tripo mesh. The app
does not use them. The text below gives the trials as they were: "the last rig" is the T-pose rig
of 77b9d9d3, and `rabbit.json` is its config at that commit.

`tripo-p2/` held the trial of 2026-11-07: the first Tripo P2 quad mesh rigged by the simple route
(design 4.4, "Simple route"). It was the app rabbit from bf942d8b until 3e06a62a, which gave the
app the A-pose rabbit again. The second Tripo rabbit ("tripo-p2/rabbit.fbx" below) replaces its
mesh. The rig files of that trial (`rabbit.blend`, `rabbit.rig.glb`, and `rabbit.rig.json`) went
with the old mesh. They are in the git history of this folder.

### rabbit-tpose.glb

The mesh has no skeleton. The arms stand out level to the sides, free of the trunk.

| Item | Value |
|---|---|
| Size | 13,759,212 bytes |
| SHA-256 | `a6dbee19e81407e6a88acb302f20a734c0021a27986ba48b999c3832caca7fea` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Khronos glTF Blender I/O v4.3.47 |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,123 triangles and 4,709 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |
| Material | One material `BakedMaterial`, double-sided, with a base color texture (8.0 MB) and a metallic-roughness texture (5.5 MB), each a PNG of 4096 × 4096 pixels |

The values below are in the units of the studio: 1 unit from the soles to the ear tips, the soles
at y = 0, +z forward, and +x the left side of the animal. The mesh is 1.902 units of the file
high, and the weld at 1e-5 gives 1,566 vertices in one part. 6 edges are open, 14 edges have more
than two faces, and 484 faces have a corner angle below 10°.

- The box is x -0.358 to 0.358, y 0 to 1, and z -0.162 to 0.158.
- The arms stand out level at y 0.47 to 0.53, free of the trunk from |x| 0.087, with the paw
  tips at |x| 0.357. The pads of each paw face down (the palm hint of the config).
- The legs part below the crotch at y 0.18. The feet reach forward to z 0.086.
- The fur is light grey, with pink inner ears, a pink nose, and pink paw pads. The black eyes
  are at y 0.646 to 0.683 and z 0.067 to 0.095. Thin whiskers leave the muzzle at y 0.57 to 0.62,
  out to |x| 0.17.
- The ears stand from y 0.76 to the top. A round tail ball sits at the back, at y 0.25 to 0.34,
  out to z -0.162.

```bash
shasum -a 256 assets/models/rabbit/rabbit-tpose.glb
```

### tripo/rabbit.fbx

A mesh of the same rabbit in the same T-pose, made with Tripo: quad faces, and arm and leg tubes
of 8 to 16 vertices around. Its arm sections and its head width are those of `rabbit-tpose.glb`
within 2 %. The FBX file keeps the quads (a GLB file of the same mesh holds only triangles). The
folder `rabbit.fbm/` holds its textures, and the FBX file links them by name.

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary |
| Contents | One mesh object `output_unwrapped`, turned 90° about X (the FBX axes have Y up), with no armature and no animation. 2,428 vertices and 2,638 faces: 2,217 quads and 421 triangles (4,855 triangles). One UV layer. One material that links the four textures |
| Parts | One connected part, with the whiskers. No vertices merge at 1e-5. 10 open edges: 3 at the root of each whisker group, 1 at each side of the nose, and 2 under the left paw. 7 edges have more than two faces |
| Box | After the turn: x ±0.3564, y ±0.1592, and z 0 to 0.998 in the units of the file. The rabbit faces -y |

| File | Size | Pixels | SHA-256 |
|---|---|---|---|
| `rabbit.fbx` | 217,104 bytes | | `6ee4f87a767c16e80576e976244b013391857b53ef33e4a59996a6f120a85c44` |
| `rabbit.fbm/rabbit_basecolor.jpg` | 889,716 bytes | 4096 × 4096 | `5c70fcccdbf4a272d9844e6f3f5ff4820f82f76062e5318cda85e99f77c3fe10` |
| `rabbit.fbm/rabbit_metallic.jpg` | 355,829 bytes | 2048 × 2048 | `cf96150d0a4f567b21d6d09568f862399939595f11ed4e7c10e0da5ef810e3df` |
| `rabbit.fbm/rabbit_normal.jpg` | 734,946 bytes | 2048 × 2048 | `e91b3d0f6c2a627e704f91778597ee0674ab9132a026b59be2db835545f812ee` |
| `rabbit.fbm/rabbit_roughness.jpg` | 191,192 bytes | 2048 × 2048 | `47e6fbac3a29e63b8d677bfc13311d399a6f4572ce7356e5693f4327f4302d94` |

### hand-rig/rabbit.rig.glb

`pnpm rig-export rabbit --blend assets/models/rabbit/hand-rig/rabbit.blend --out
assets/models/rabbit/hand-rig/rabbit.rig.glb` writes it, with the text summary `rabbit.rig.json`.
A run gives the same bytes.

| Item | Value |
|---|---|
| Size | 551,340 bytes |
| SHA-256 | `a2c1f3547193685c78e56365ccf16b591facd093f8d16f565487cdffac293e5c` |
| Form | The mesh of `rabbit.blend` in its seated bind (below). The seat top is 0.250 m high, and the chair is 0.42 m wide and 0.237 m deep, as the chair of the old rabbit |
| Faces | 5,961 triangles, of them 75 gloss (the nose) |
| Extras | `eyes`: the middle, the direction, and the size of each eye object. `body`: the facts of the body of the armature |
| Shapes | The arm-down shape of each arm and the straight legs of each side, which the export calculates |

### hand-rig/rabbit.blend

The hand rig of the rabbit (design 4.4, "Hand rig"), made in a live Blender 5.2 from
`tripo/rabbit.fbx`: the mesh, the colors, the armature, the weights, the bead eyes, the seated bind
(the Action `bind`), and the facts of the body. Each edit of the mesh was a point edit by hand, or
one translation, scale, or loop cut of a named part.

| Item | Value |
|---|---|
| Size | 330,824 bytes |
| SHA-256 | `720afe210929c401e00aaac1dbbd8a469e4315c0327adfe1b82afb479795d373` |
| Origin | Made by hand in Blender 5.2 from `tripo/rabbit.fbx` |
| License | CC BY-NC 4.0, as the FBX file |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the ear tips of the source, the soles at z = 0, the animal faces -y, and +x is its left side. The longer legs lift the body 0.0806 units, so the ear tips are at z = 1.0806. No object has a transform |
| Mesh | One object `rabbit`: the FBX mesh with edits by hand, flat faces, no custom normals, and the surface of `sa.add_surface()`. 2,981 vertices and 3,202 faces (2,759 quads and 443 triangles, 5,961 triangles), 42 faces of them gloss (the nose) |
| Eyes | The objects `eye_L` and `eye_R` of `se.place_eyes()`, children of the bone `head`, with the size 0.200104 units (0.286547 m) and the direction (±0.7526, -0.6512, 0.0974) of the last rig. Each middle lies on the flat eye area of the head on the eye axis in the bind: (0.0666, -0.0625, 0.7390) and (-0.0672, -0.0630, 0.7390) |
| Materials | The slots `fur` and `gloss`. Each reads the face attribute `color` |
| Armature | One object `rabbit_rig`: the 30 body bones with no tail tip, and the 20 arm segments and helpers (helpers 0.03 units long), with the parents of `STUDIO_PARENTS`, the rest in the T-pose, and the properties `palm` (0, -0.0201, -0.9998), `seat`, `hinges`, and the facts of the body. The Z axis of each bone points to its hint (`sa.fix_rolls(rabbit_rig)`). The Action `bind` holds the seated bind at frame 1 |
| Shape keys | None. The seated bind and the play show no fault that a `bind*` or `arm_raise_*` key must fix |
| Weights | The automatic weights of Blender and fixes by hand, at most 4 bones on each vertex, each sum 1. The upper arm, the forearm, the forearm twist bone, and `root` hold no weight |

The rig is a rejected trial, so this file keeps no steps. The steps of each edit, the
bind, the weights, and the keys are in the git history of this `README.md`, at e40c077df.

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
body. Two form edits change the source: the size of the eyeballs and their sockets ("Eyes"
below), and the size of the front paws ("Paw size" below). The arms and the legs keep the length
of the source: no cut, no split from the trunk, and no stretch.

| Item | Value |
|---|---|
| Size | 394,177 bytes |
| SHA-256 | `f74f1fe669681a7895151e1cef7c0132310ed436f074eecbffb549d43dcf97d2` |
| Origin | Made in Blender 5.2 from `tripo-p2/rabbit.fbx` |
| License | CC BY-NC 4.0, as the FBX file |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the ear tips, the soles at z = 0, the rabbit faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `rabbit`: 3,790 vertices and 4,012 faces (3,388 quads and 624 triangles, 7,400 triangles), flat faces, and the surface of `sa.add_surface()`. 27 faces are gloss (the pink nose). The 80 faces of the two eyeballs have the face attribute `eye`, and the 312 faces of the two lids the face attribute `lid`. The UV map of the FBX, and the property `texture` (`assets/models/rabbit/tripo-hand/rabbit-color.webp`) |
| Armature | `rabbit_rig`: the 30 body bones and the 20 arm segments and helpers of the simple route, at the joints of `tools/mesh-rigs/simple/rabbit-tripo.json` (the source joints, mapped by the paw turns and the paw edit). The Action `bind` holds the seated bind of the bind rules of that config, with no bind supination. The properties `palm`, `hinges`, `seat`, and `lids` come from the steps below |
| Facts | `height` 0.795385 (the shoulder joints at 1.4867 m for each unit, so that H is 0.2985 m, the H of the rabbit of main), `crease` 180, `backRoom` 0.01 |
| Eyes | The eyeballs of the mesh at 0.93 of the source, with the finish `varnish` and no eye light (`eyeFinish` of the entry), the irises of the source map moved out ("Eyes" below), and a blink lid on each. No eye objects, so the app adds no bead eyes |

The export of the file (`pnpm rig-export rabbit --blend assets/models/rabbit/tripo-hand/rabbit.blend
--out assets/models/rabbit/tripo-hand/rabbit.rig.glb`). License of both files: CC BY-NC 4.0, as the
FBX file.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/rabbit.rig.glb` | 1,218,832 bytes | `a6bdeba155a1fb5188c49d403aa3f6006e56addf4d5dae0708c1ff70c7a68d41` |
| `tripo-hand/rabbit.rig.json` | 16,320 bytes | `d230b7cafa3cfcb0bcfbff339eb60d344935e03f11041271d4711e1d54697e11` |

The scripts of the session (`scratch/rabbit3/` of the worktree, which git ignores: `build.py`,
`redits.py`, `rimport.py`, `rings.py`, `make_config.py`, `chain-here.sh`, and `params.json`) are
not in the repo. They follow the scripts of the second Tripo rabbit and the fourth Tripo cat. The
edits, in the order of the work (`sa` is `tools/blender/studio_armature.py`, x is the x of the left
arm). Each edit is a need of the rig, the seat, or the instrument:

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

The trunk, the neck, the head, the hips, the legs, and the tail keep the automatic weights.

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
| frog | -42.3 | -32.8 | -13.5 | 1.7 | 21 | 7 |
| tip | -42.3 | -32.7 | 3.7 | -23.5 | 21 | 5 |
| crossing | -37.9 | -35.3 | -13.5 | 8.0 | 20 | 8 |
| rest | 22.2 | 31.9 | -27.8 | 4.8 | 64 | 47 |
| lift50 | 10.1 | 41.7 | -39.8 | 4.1 | 31 | 16 |
| lower50 | 9.3 | 28.9 | -40.4 | 4.9 | 30 | 8 |
| stand | -41.8 | -34.6 | -13.8 | 3.4 | 21 | 6 |

With the right paw turned 2 steps, the right forearm twisted 59 degrees at the tip. With 1 step and
the rest hold of the second rabbit, it twisted 50 degrees at rest, and the left forearm 56 degrees.
The rest holds the bow tip down and forward (design 5.2). A bow tip straight down twisted the right
forearm by about 175 degrees at rest, because the paw grips the stick across the palm.

**Violin.** The arms reach 0.291 m from the shoulder joint to the middle of the palm (0.262 m on
the second Tripo rabbit). The violin is 0.9 of the violin of the app (0.456 m, `violinScale` of
`src/models/species.ts`, 0.75 before): the left paw reaches the fingerboard from 0.67 of its
length from the nut, and the bow paw 0.125 m of the hair (`pnpm hold-reach rabbit --instrument
violin`). The rule of a violin shop gives 0.541.

**Seat.** The thighs slope 15 degrees down and 8 degrees out in the bind, and the shins lean 12
degrees forward (`legTurns` of the config). The front of the seat lies 0.05 units behind the knee
joint of the bind, and 53 % of the thigh lies on the seat. The legs keep the length of the source,
so the seat height of the app is 0.167 m (`seatHeight` of `src/models/studio/rabbit.ts`, 0.207 m
on the second Tripo rabbit). The chair of the app fits it.

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
the forward axis of the head, turned 4 degrees out, at the mean height of the two pupils. Each
iris moves only 0.35 of the way to that target (`SHIFT_SHARE`), because the full turn read
wall-eyed from the front: the left iris turns 2.8 degrees and the right iris 2.7 degrees. The
white of the same eye, row by row, fills the place that the iris leaves, and the clean outer rim
of each iris fills its nose rim, so no mirror of one eye goes into the other and no seam shows.
So the eyes stay near the source paint, with a small move out. From the default camera the iris
shows below the upper lid. The
map paints a light in each pupil, so the eyes take the finish `varnish` and no eye light, which
gives one light in each eye.

**Color map.** `tools/rabbit-maps.py` writes `rabbit-color.webp` and `rabbit-normal.webp` from the
source maps, as `tools/wolf-maps.py`:

```text
uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/rabbit-maps.py
```

The color map is the source scaled to 2048 pixels (Lanczos), with the irises moved ("Eyes"
above), WebP quality 60, method 6 (Pillow 13.0.0). Before the WebP step, 10,347 texels change:
7,231 eyeball texels and 3,116 texels of the padding next to them. No other texel changes.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/rabbit-color.webp` | 252,458 bytes | `778b41387ae64891340ec158e3206b0f874377a2aaf70794184ce0a889fb7075` |
| `tripo-hand/rabbit-normal.webp` | 142,378 bytes | `c18a8ae6ddbee8ad2b0d188376150e0dcb0dd9ecc393ba3fd06b91d13c3811b9` |

**Normal map.** Each x, y tilt of the normal map of the FBX limited to 0.2 (7.30 % of the
texels), a box scale to 1024 pixels, the tilts times 4 (`NORMAL_MAP_GAIN` of `src/scene/fur.ts`)
in red and green, 255 in blue, and `cwebp -q 60 -sharp_yuv -m 6` (libwebp 1.5.0). The mean
normal of the source is (-0.002, -0.005, 0.986).

**Differences from the source.** The app light is warm and comes from above, so the cream fur
reads warmer than in the even gray light of an FBX viewer. The eyes are 0.93 of the source, and
each iris sits about 8 degrees farther out on its ball. Each eye has a blink lid. The front
paws are 0.8 of the source in length and width. The paw turns move the seam of each wrist band.

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
