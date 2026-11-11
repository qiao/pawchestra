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

`tripo-hand/` holds a candidate body ("tripo-hand/rabbit.blend" below): a hand rig of the second
Tripo P2 mesh `tripo-p2/rabbit.fbx`, made in headless Blender by the route of the Tripo wolf: the
form, the colors, and the eye paint of the source, with no arm cut and no stretch.
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
`tripo/rabbit.fbx`: the mesh, the colors, the armature, the weights, the pea eyes, the seated bind
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

The second Tripo rabbit: a cream rabbit in a T-pose with quad faces, made with the Tripo CLI from a
new turnaround sheet with a cuter form. Its arm tubes have 10 vertices around, and its leg tubes
12. It replaces the first Tripo P2 rabbit (FBX SHA-256
`6ee4f87a767c16e80576e976244b013391857b53ef33e4a59996a6f120a85c44`).

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Task | `24ce6e89-724f-47a7-ae86-bb0d2a2646b8`, type `multiview_to_model`, from three views of the sheet (front, side, and back) |
| Parameters | `model_version` P2-20260801, `quad` true, `face_limit` 3000, `texture` true, `texture_quality` detailed, `texture_version` v3.5-20260815, `delight` true, `pbr` true, `export_uv` true |
| Writer | Tripo, FBX 7.4 binary. The four maps lie packed in the FBX file |
| Contents | One mesh object, with no armature and no animation. 3,288 vertices and 3,479 faces: 2,941 quads and 538 triangles (6,420 triangles), no n-gon. One UV layer |
| Parts | 13 parts: the body (2,988 vertices), two eyeballs (71 vertices each, open at the back), two brow strips (47 vertices each), and eight whisker strips (four of 9 and four of 7 vertices). No vertices merge at 1e-5. 128 open edges, and no edge with more than two faces |
| Axes | The rabbit faces +x of Blender. The import turns the mesh -90 degrees about Z, so that it faces -y. Then 1 unit from the soles to the ear tips, x ±0.3105 (the paw tips), and z ±0.1302 |

The folder `rabbit.fbm/` holds the base color map and the normal map, saved from the packed maps
of the FBX file as PNG files of 4096 × 4096 pixels and then as JPEG quality 95 (Pillow). The
roughness and the metallic maps are not kept.

| File | Size | Pixels | SHA-256 |
|---|---|---|---|
| `rabbit.fbx` | 5,622,716 bytes | | `1d10fbd9b41f91df1776bc15da13df13398d9c23c740a77e85469e8d287eb249` |
| `rabbit.fbm/rabbit_basecolor.jpg` | 1,264,615 bytes | 4096 × 4096 | `83786eda88e3a0f7f222d0a902e6545d43df671cc2e9b75eb4bef44a03071080` |
| `rabbit.fbm/rabbit_normal.jpg` | 995,060 bytes | 4096 × 4096 | `6f96f7505bb3bba89b251a58127d64d10f178e190e14db95d6b3827f8e51ce24` |

The color map paints a full eye on each eyeball (a black pupil, an amber iris, and white),
thin brown brows on the brow strips, a pink nose, pink inner ears and paw pads, a painted smile,
and white whiskers.

**Eyes.** The eyes keep the eye paint of the source map: a large black pupil in an amber iris with
a dark ring, and white around it. The source paints no light in the eyes, so the eyeballs take the
finish `eye` and the eye light of the app, which gives one small light in the upper part of each
eye.

### tripo-hand/rabbit.blend

The candidate hand rig of the second Tripo P2 rabbit (design 4.4, "Hand rig"), made in headless
Blender 5.2 (`blender -b --factory-startup`) by one build script, as the Tripo wolf
(`../wolf/README.md`). The body keeps the form, the colors, the eyeball size, and the eye paint of
the source: no point edit changes the head, the eyes, the trunk, the paws, or the legs. The arms
and the legs keep the length of the source: no cut, no split from the trunk, and no stretch.

| Item | Value |
|---|---|
| Size | 383,084 bytes |
| SHA-256 | `6ec29a4b5ea9bd2048e5fc9ebbfc849c1eaf0175131b6e107388eab18dbd07c5` |
| Origin | Made in Blender 5.2 from `tripo-p2/rabbit.fbx` |
| License | CC BY-NC 4.0, as the FBX file |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the ear tips, the soles at z = 0, the rabbit faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `rabbit`: 3,760 vertices and 3,899 faces (3,361 quads and 538 triangles, 7,260 triangles), flat faces, and the surface of `sa.add_surface()`. 18 faces are gloss (the pink nose). The 148 faces of the two eyeballs have the face attribute `eye`, and the 312 faces of the two lids the face attribute `lid`. The UV map of the FBX, and the property `texture` (`assets/models/rabbit/tripo-hand/rabbit-color.webp`) |
| Armature | `rabbit_rig`: the 30 body bones and the 20 arm segments and helpers of the simple route, at the joints of `tools/mesh-rigs/simple/rabbit-tripo.json` (the source joints, mapped by the paw turns). The Action `bind` holds the seated bind of the bind rules of that config, with no bind supination. The properties `palm`, `hinges`, `seat`, and `lids` come from the steps below |
| Facts | `height` 0.806623 (the shoulder joints at 1.4795 m for each unit, so that H is 0.2985 m, the H of the rabbit of main), `crease` 180, `backRoom` 0.01 |
| Eyes | The eyeballs of the mesh at the size of the source, with the `eye` finish and the eye light ("Eyes" above), the gaze shift of the color map ("Color map" below), and a blink lid on each. No eye objects, so the app adds no bead eyes |

The export of the file (`pnpm rig-export rabbit --blend assets/models/rabbit/tripo-hand/rabbit.blend
--out assets/models/rabbit/tripo-hand/rabbit.rig.glb`). License of both files: CC BY-NC 4.0, as the
FBX file.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/rabbit.rig.glb` | 1,038,444 bytes | `fc251d75e88a4f8fe5b00e5bc4d95b62bb3ddcc26c84b28f5f694824e13a4970` |
| `tripo-hand/rabbit.rig.json` | 17,548 bytes | `15af1a7c52a2c8385122c8c6381ad0160c35daa4288b1db3e640833f07610cab` |

The scripts of the session (`scratch/rabbit2/` of the worktree, which git ignores: `build.py`,
`redits.py`, `rimport.py`, `rings.py`, `make_config.py`, `chain-here.sh`, and `params.json`) are
not in the repo. They follow the scripts of the Tripo fox (`assets/models/fox/README.md`). The
edits, in the order of the work (`sa` is `tools/blender/studio_armature.py`, x is the x of the left
arm). Each edit is a need of the rig, the seat, or the instrument:

- **Import.** `sa.import_source('assets/models/rabbit/tripo-p2/rabbit.fbx', 1e-5)`, then a turn of
  -90 degrees about Z, because the FBX faces +x. No vertex merges. Each face is flat.
- **Arm rings.** Edge ring Subdivide (`bmesh.ops.subdivide_edges(bm, edges=<ring>, cuts=<n>,
  use_grid_fill=True)`) of the clean quad bands of 10 edges between two closed arm loops: x 0.094 to
  0.1175 (1 cut) and x 0.182 to 0.207 (2 cuts).
- **Knee rings.** The same call with 1 cut on the clean leg bands of 12 edges at y 0.157 to 0.184
  and 0.184 to 0.212. The knee joint is at y 0.178.
- **Rings with no split.** These bands stop at a triangle or a pole: the arm root to x 0.094, the
  elbow band from x 0.1175 to x 0.182 (triangles and poles at x 0.141 to 0.157, so the partial
  rings there carry the bend), the wrist and the paw from x 0.207, and the leg below y 0.157.
- **Paws turned.** Each vertex past the arm ring at x 0.199 turns rigidly about the rest forearm
  axis by whole ring steps of 36 degrees: -180 degrees on the left (5 steps) and 72 degrees on the
  right (2 steps), 267 vertices on each side. New quads join the two rings with the same step
  offset. Each turned vertex of the far ring moves back to the place of the ring before the turn,
  and the move fades to 0 at 0.02 units along the paw. The new quads take the planar UVs of the
  clean fur patch at UV (0.8693, 0.8285) ("Arm twist").
- **Point edits.** None. The head, the eyes, the cheeks, the trunk, the paws, and the legs keep the
  form of the source.
- **Surface.** `sa.add_surface(rabbit, 'rabbit', 'assets/models/rabbit/tripo-p2/rabbit.fbm/rabbit_basecolor.jpg',
  eye_fans=False, config=<rabbit-tripo.json>)`. The faces of the two eyeballs get the face
  attribute `eye`. The export then gives `ownEyes`. 37 light faces over the nose of the nose box
  leave the gloss nose, so that they show the color map and no flat light square shows.
- **Armature.** The armature of the config with a palm for each side: the true palm of the
  source, (-0.035, -0.997, -0.063) in the studio axes with x mirrored on the right, turned by the
  paw turn. The property `hinges` holds the elbow axis of the config of each side, turned about
  its bind upper arm by 6 degrees on the left and -37 degrees on the right ("Arm twist" below).
  The hip joint lies at (0.0595, 0.287, 0.004): with z 0.0035, the thigh points almost opposite to
  the hips bone, and the rest frames of the leg bones in Blender scaled by 3e-5, above the limit of
  `pnpm rig-export`.

The weights, in the order of the work, in the rest pose:

1. Automatic Weights, then Limit Total 4 and Normalize All, on a copy of the mesh with no loose
   part. Each vertex takes the row of its copy.
2. Arm rows: each vertex of a side with |x| from 0.075, within 0.045 units of the line of the rest
   arm, takes one exact row with `sa.set_weight_row()`: a clavicle share and an elbow helper share,
   linear between the control rows below, and the rest on the 4 roll segments of the upper arm or
   the forearm. The elbow bend spreads over 5 rings, from x 0.12 to x 0.175.

   | x | 0.075 | 0.085 | 0.093 | 0.101 | 0.11 | 0.12 | 0.13 | 0.142 | 0.153 | 0.165 | 0.175 |
   |---|---|---|---|---|---|---|---|---|---|---|---|
   | Clavicle | 0.40 | 0.25 | 0.12 | 0.04 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
   | Elbow helper | 0 | 0 | 0 | 0 | 0 | 0 | 0.25 | 0.75 | 0.75 | 0.25 | 0 |

3. Wrist rows: with d the place along the rest forearm axis past the head of `hand_<side>`, the
   bend share b of the paw grows in 12 equal steps, one in each band of 0.0035 from d -0.035. A row
   with b of 0.5 or less is {`wrist` 2b, the arm row the rest}, above 0.5 {`wrist` 2 (1 - b),
   `hand` 2b - 1}.
4. Knuckle rows: from d -0.02 past the head of `fingers_<side>`, the `hand` share of each row
   splits into `hand` and `fingers` by a fingers share that grows in 12 equal steps of 0.003.
5. The vertices of the loose parts (the eyeballs, the brow strips, and the whisker strips) and of
   the gloss nose take {`head` 1}: 357 vertices.
6. Ear rows: a plane across the base of each ear, through four points of the left ear base of the
   source, (0.05, 0.785, 0), (0.05, 0.775, -0.07), (0.022, 0.795, -0.035), and (0.078, 0.765,
   -0.035) (studio axes, x mirrored on the right). Each head vertex above the plane by 0.008 or
   more and with |x| above 0.002 takes {`ear_<side>` 1}, one from 0 to 0.008 {`ear_<side>` 0.5,
   `head` 0.5}, and each other vertex gives its ear share to `head` (403 ear, 20 base, and 339
   head rows). With the automatic weights, the inner ear bases near the middle plane counted as
   head, and the measured H was too large.

The trunk, the neck, the head, the hips, the legs, and the tail keep the automatic weights.

**Smooth surface.** No relax, no region colors, no trunk scale, and no belly key: the form stays
the form of the source. The crease angle 180 gives each corner the mean normal of the faces at its
vertex, as the smooth shading of an FBX viewer.

**Arm twist.** The roll of each upper arm (from the clavicle) and the twist of each forearm (the
paw from the upper arm), in degrees, in each moment of the hold `RABBIT_HOLD` of
`src/pose/bowed-rig.ts` (`pnpm pose-preview violinist`):

| Moment | Left upper arm | Left forearm | Right upper arm | Right forearm |
|---|---|---|---|---|
| frog | -41.4 | -16.2 | -26.2 | -3.5 |
| tip | -41.5 | -16.2 | -23.9 | -28.4 |
| crossing | -36.9 | -18.9 | -29.5 | 1.4 |
| rest | 38.4 | 39.0 | 23.5 | -7.1 |
| lift50 | 38.4 | 9.2 | 7.9 | 6.2 |
| lower50 | 36.3 | 0.7 | 0.0 | 6.1 |
| stand | -40.5 | -18.5 | -26.5 | -1.5 |

With no paw turn, the right forearm twisted 78 to 115 degrees in each moment.

**Short arms and the violin.** The arms reach 0.262 m from the shoulder joint to the middle of
the palm (0.36 m on the rabbit of main), so the violin of the rabbit is 0.6 of the violin of the
app (`violinScale` of `src/models/species.ts`). The source arms cannot reach a larger violin: the
rule of a violin shop gives 0.477 for these arms. The left paw reaches the fingerboard from 0.25
of its length from the nut, and the bow paw 0.244 m of the hair (`pnpm hold-reach rabbit
--instrument violin`).

**Seat.** The thighs slope 15 degrees down and 8 degrees out in the bind, and the shins lean 12
degrees forward (`legTurns` of the config). The front of the seat lies 0.05 units behind the knee
joint of the bind, and 52 % of the thigh lies on the seat. The legs keep the length of the source,
so the seat height of the app is 0.207 m (`seatHeight` of `src/models/studio/rabbit.ts`, 0.262 m on
the rabbit of main). The chair of the app fits it.

**Lids.** A lid on each eye: 14 × 13 points from psi -60 to 60 degrees and lam -48 to 70 degrees
(48 degrees in and 70 out, the right lid mirrors the range) at 1.14 ball radii, and a lower strip
at 1.07 radii (the ball reaches 1.051 radii), 156 quads on each side, held turned up 126 degrees
into the head. The property `lids` holds the angle 2.199115 and the hinge axes, left (0.942765,
0.333458, 0) and right (0.949856, -0.312687, 0). The lid faces take the UVs of the clean fur patch
at UV (0.8693, 0.8285) at 0.99 UV for each unit, and the row `head` 1. In the 21 steps of the blink
no open lid point, side edge, or back edge leaves the head (ray casts). The balls have the size of
the source, and with the earlier rule (lam -40 to 70 degrees at 1.17 radii) 3 points of the right
lid left the head at the closed step.

**Color map.** `tools/rabbit-maps.py` writes `rabbit-color.webp` and `rabbit-normal.webp` from the
source maps and the rig file:

```text
uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/rabbit-maps.py
```

The color map is the source scaled to 2048 pixels (Lanczos), WebP quality 60, method 6 (Pillow
13.0.0). No texel changes its color: the cream fur, the pink, the brows, the whiskers, and the eye
paint stay. The only change is the gaze shift of `tools/gaze_shift.py`. The source paints each
iris at the inner corner of its eye opening, and with the source place the rabbit looked
cross-eyed in the front view and down in the play view on a phone. The shift moves each iris, with
its pupil, as one decal on the ball. Each moved texel is a copy of a texel of the same ball, and no
texel gets darker:

- The target of each iris is the middle of the eye opening in a view 30 degrees above the forward
  axis of the head of the seated bind (`VIEW_DOWN`), turned 6 degrees out (`GAZE_OUT`). The
  default camera looks down 29 degrees at the stage, and the head of the violinist turns down 9
  degrees in the play. From that camera, the iris of each rabbit shows below the upper lid.
- The left iris moves 21.1 degrees and the right iris 20.7 degrees on the ball. The source paints
  no lash line, so the old place of each iris takes white up to the edge (`LASH_LINE`).

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/rabbit-color.webp` | 69,624 bytes | `fa5308f91e6b5208d5d64f298b147dc570e86c906771a4b54ebfb1d404593940` |
| `tripo-hand/rabbit-normal.webp` | 24,694 bytes | `71551c8613a7f9908945d492d34da22209dca1a54f043a22bf77397799c4e749` |

**Normal map.** Each x, y tilt of the normal map of the FBX limited to 0.2 (0.61 % of the
texels), a box scale to 1024 pixels, the tilts times 4 (`NORMAL_MAP_GAIN` of `src/scene/fur.ts`)
in red and green, 255 in blue, and `cwebp -q 60 -sharp_yuv -m 6` (libwebp 1.5.0). The mean
normal of the source is (0.001, -0.003, 0.993), and 12 texels have z below 0.

**Differences from the source.** The app light is warm and comes from above, so the tan fur reads
lighter and more cream than in the even gray light of an FBX viewer. The irises lie nearer the
middle of the eye openings than in the source. Each eye has a blink lid.

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
angle of 55, and a color map with a fur shift, a round iris, and softer brows.
