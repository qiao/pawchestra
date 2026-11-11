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
Tripo P2 mesh `tripo-p2/rabbit.fbx`, made in headless Blender with no arm cut and no arm stretch.
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

The color map paints a full eye on each eyeball (a black pupil, an amber iris, and a white light),
thin brown brows on the brow strips, a pink nose, pink inner ears and paw pads, a painted smile,
and white whiskers.

**Eyes.** The eyes keep the eye paint of the source map: a large black pupil in an amber iris
with a dark ring, and white around it. The source map paints each iris at the inner corner of its
opening, so in the front view the rabbit looked cross-eyed. `center_irises()` of
`tools/rabbit-maps.py` (a copy of the method of the Tripo fox, `assets/models/fox/README.md`,
"Eyes") moves each iris with its pupil as one decal on the ball to the middle of the opening of
the front view:

- The pupil is the middle of the dark texels of the opening after an erosion, and the iris radius
  is the first ring of 1 degree about it with 5 % white, plus 2 degrees (34 degrees on each side).
- The left iris moves 11.8 degrees and the right iris 10.8 degrees on the ball (0.31 and 0.28
  opening radii out, 0.14 and 0.13 opening radii up).
- The iris paint of the source stops at the inner corner, so the hidden part of the moved iris
  takes the mirror of the other side of the same iris. The old place of the iris takes the white
  of the other side of the opening. The source map paints no lash line, and its iris reaches the
  lower edge of the opening, so the white goes up to the edge (`LASH_LINE = False`). Each new
  texel is a copy of a texel of the same ball.

The source map paints no light on the eyes. `EYE_PAINT = 'cartoon'` of the tool paints the
cartoon eye of the sheet again (`paint_eyes()`). The eyeballs take the finish `varnish` and no eye
light (`eyeFinish` of the rabbit entry of `tools/studio-body.ts`), as the eyes of the fox, so each
eye shows only the sheen of the finish.

**Cute face.** The face is a baby face, as a moderate first step: open lids and rounder cheeks
("Cheeks" and "Lids" below). The muzzle keeps its length. The eyes keep the size from before the
cute step, so that the painted eye of the source does not read too large ("Eye size"). The head
height H, the ears, the body, and the colors stay.

### tripo-hand/rabbit.blend

The candidate hand rig of the second Tripo P2 rabbit (design 4.4, "Hand rig"), made in headless
Blender 5.2 (`blender -b --factory-startup`) by scripted point edits, in the order below. The arms
keep the length of the source: no cut, no split from the trunk, and no stretch. The shins are
longer for the seat height of the rabbit of main ("Longer shins" below).

| Item | Value |
|---|---|
| Size | 390,238 bytes |
| SHA-256 | `7522bba02dc54c2848cf32dd0879bee1933909b79b75f6b1aaa246dc312c4334` |
| Origin | Made in Blender 5.2 from `tripo-p2/rabbit.fbx` |
| License | CC BY-NC 4.0, as the FBX file |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the ear tips before the edits, the soles at z = 0, the rabbit faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `rabbit`, with the shape key `bind_belly` ("Belly" below): 3,760 vertices and 3,899 faces (3,361 quads and 538 triangles, 7,260 triangles), flat faces, and the surface of `sa.add_surface()`. 18 faces are gloss (the pink nose). The 148 faces of the two eyeballs have the face attribute `eye`, and the 312 faces of the two lids the face attribute `lid`. The UV map of the FBX, and the property `texture` (`assets/models/rabbit/tripo-hand/rabbit-color.webp`) |
| Armature | `rabbit_rig`: the 30 body bones and the 20 arm segments and helpers of the simple route, at the joints of `tools/mesh-rigs/simple/rabbit-tripo.json` (the source joints, mapped by the paw turns and the point edits). The Action `bind` holds the seated bind of the bind rules of that config, with no bind supination. The properties `palm`, `hinges`, `seat`, and `lids` come from the steps below |
| Facts | `height` 0.861111 (the shoulder joints at 1.474 m for each unit, so that H is 0.2985 m, the H of the rabbit of main), `crease` 55, `backRoom` 0.01 |
| Eyes | The eyeballs of the mesh, with the finish `varnish` and no eye light ("Eyes" above), and a blink lid on each. No eye objects, so the app adds no bead eyes |

The export of the file (`pnpm rig-export rabbit --blend assets/models/rabbit/tripo-hand/rabbit.blend
--out assets/models/rabbit/tripo-hand/rabbit.rig.glb`). License of both files: CC BY-NC 4.0, as the
FBX file.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/rabbit.rig.glb` | 847,100 bytes | `7462376dc96bf5ca9ca682d13936e508403bb1f4941fe00813155962af37c996` |
| `tripo-hand/rabbit.rig.json` | 17,549 bytes | `487f93620377b70ab22c13b87c200ca1cdb061151ba5884abbc64e73d32c9331` |

The scripts of the session (`scratch/rabbit2/` of the worktree, which git ignores: `build.py`,
`redits.py`, `rimport.py`, `rings.py`, `make_config.py`, and `params.json`) are not in the repo.
They follow the scripts of the new Tripo fox (`assets/models/fox/README.md`). The edits, in the
order of the work (`sa` is `tools/blender/studio_armature.py`, x is the x of the left arm):

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
  right (2 steps), 267 vertices on each side. The 10 quads of the band from the ring at x 0.199
  go, and new quads join the two rings with the same step offset. The arm rings are flat ovals, so
  each turned vertex of the far ring then moves back to the place of the ring before the turn, and
  the move fades to 0 at 0.02 units along the paw. The join has no step. The new quads take the
  planar UVs of the clean fur patch at UV (0.8693, 0.8285).
- **Point edits.** Before the surface, in this order, as maps of the rest points: "Eye size",
  "Paw size", "Arm girth", "Leg girth", and "Longer shins" below.
- **Surface.** `sa.add_surface(rabbit, 'rabbit', 'assets/models/rabbit/tripo-p2/rabbit.fbm/rabbit_basecolor.jpg',
  eye_fans=False, config=<rabbit-tripo.json>)`. The faces of the two eyeballs get the face
  attribute `eye` and the eye color of the app. The export then gives `ownEyes`.
- **Armature.** The armature of the config with a palm for each side: the true palm of the
  source, (-0.035, -0.997, -0.063) in the studio axes with x mirrored on the right, turned by the
  paw turn. The property `hinges` holds the elbow axis of the config of each side, turned about
  its bind upper arm by 6 degrees on the left and -37 degrees on the right ("Arm twist" below).

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
   -0.035) (studio axes, x mirrored on the right), mapped by the point edits. Each head vertex above
   the plane by 0.008 or more and with |x| above 0.002 takes {`ear_<side>` 1}, one from 0 to 0.008
   {`ear_<side>` 0.5, `head` 0.5}, and each other vertex gives its ear share to `head` (403 ear, 20
   base, and 329 head rows). With the automatic weights, the inner ear bases near the middle
   plane counted as head, and the measured H was 0.281 units in place of 0.2025.

The trunk, the neck, the head, the hips, the legs, and the tail keep the automatic weights.

**Arm twist.** The roll of each upper arm (from the clavicle) and the twist of each forearm (the
paw from the upper arm), in degrees, in each moment of the hold `RABBIT_HOLD` of
`src/pose/bowed-rig.ts` (its comment gives the rest elbow and the rest paw turn):

| Moment | Left upper arm | Left forearm | Right upper arm | Right forearm |
|---|---|---|---|---|
| frog | -40.5 | -13.4 | -27.6 | -3.7 |
| tip | -40.6 | -13.5 | -24.6 | -28.2 |
| crossing | -36.1 | -15.1 | -31.1 | 0.5 |
| rest | 41.3 | 39.7 | 22.7 | -7.2 |
| lift50 | 38.1 | 13.2 | 6.9 | 6.2 |
| lower50 | 35.5 | 5.1 | -1.1 | 6.4 |
| stand | -39.8 | -15.7 | -27.8 | -1.7 |

With no paw turn, the right forearm twisted 78 to 115 degrees in each moment.

**Short arms and the violin.** The arms reach 0.252 m from the shoulder joint to the middle of
the palm (0.36 m on the rabbit of main), so the violin of the rabbit is 0.6 of the violin of the
app (`violinScale` of `src/models/species.ts`). The left paw then reaches the fingerboard from 0.24
of its length from the nut, and the bow paw 0.244 m of the hair (`pnpm hold-reach rabbit
--instrument violin`). With the violin of 0.83 of the first Tripo rabbit, the left paw held the
violin body and the bow paw moved only 6 cm along the hair.

**Form against the rabbit of main.** The values of `pnpm body-shape violinist --base main`, in
cm, at the same H of 29.9 cm (main, then this rig):

| Measure | Main | This rig | Source |
|---|---|---|---|
| Trunk width W1 to W9 | 41.1 to 24.5 | 33.4 to 21.8 | 34.8 to 21.4 |
| Trunk depth D3 to D9 | 36.0 to 22.3 | 29.2 to 15.1 | 27.2 to 13.2 |
| Upper arm girth | 32.1 | 30.8 | 27.5 |
| Forearm girth | 23.8 | 23.0 | 23.4 |
| Thigh girth | 47.7 | 49.5 | 54.3 |
| Shin girth | 29.9 | 30.6 | 34.3 |
| Seat height | 26.2 | 26.6 | 16.6 |

- **Eye size.** Each eyeball and its socket scale about the middle of the ball by 0.85 (the edit
  `eyes` of the fox, with the ball middles (±0.0336, 0.7016, 0.0535), rBall 0.033, rIn 0.04, rOut
  0.07, mid 0.02, and zKeep 0.11). The ball is 0.27 H across (0.32 H in the source). In the front
  view each ball shows 0.164 of the head width at the eye line. The cute step scaled the balls by
  1.02 (0.33 H across, 0.20 of the head width), and with the painted eye of the source the eyes
  read too large.
- **Cheeks.** The edit `cheeks` of the fox: each point near the cheek point (±0.075, 0.66, 0.08)
  under each eye moves by up to 0.006 units (2.8 % of the head width) along (±0.8, -0.2, 0.55),
  the full move to 0.012 units and a smoothstep to 0 at 0.045. The move is 0 within 0.044 units of
  the middle of a ball, and full from 0.056. Each whisker strip moves as one piece.
- **Paw size.** From the wrist joint to the finger tips, 0.42 H long in the source against 0.29 H
  on the rabbit of main. The edit `paw` of the fox (length 0.72, width 0.8, thickness 0.9, ramp
  0.015 units) makes it 0.30 H.
- **Arm girth.** Each arm point moves away from the line from the shoulder joint to the wrist
  joint, square to the line, by a factor of 1 at x 0.07, 1.1 at x 0.085, 1.12 from x 0.1 to 0.13,
  1.05 at x 0.15, and 1 from x 0.165. The share fades from 1 at 0.032 units from the line to 0 at
  0.045, so the trunk and the head stay.
- **Leg girth.** The edit `shin` of the fox with the factor 0.89 on the band y 0.05, 0.07, 0.24,
  0.27, so that the thighs and the shins come near the girths of main.
- **Longer shins.** The knee joint lies at y 0.178, high on the leg: the thigh is then 16.1 cm
  (16.9 cm on main), and the seat height was 20.7 cm. The edit `legs` of the fox makes the band y
  0.05, 0.07, 0.15, 0.17 (from the ankle to below the knee) 1.39 times longer, and the seat height
  is 26.6 cm. The thighs keep their length.
- **Trunk.** Each horizontal section of the trunk scales about its middle by its weight on the
  trunk bones, with the width and the depth factors 1.12 and 1.18 at the hips, 1.25 and 1.35 at
  the belly and the waist, 1.12 and 1.22 at the chest, and 1.08 and 1.25 at the neck joint. The
  trunk then lies between the source and main.

**Smooth surface.** Each face takes the color of its region (pink by a hue below 26.5 degrees and
a saturation of 0.25 or more, else fur), and ten Taubin rounds (0.5, then -0.53) relax the body,
with each move clipped to 0.01 units. The loose parts and the gloss nose stay. 37 light gloss
faces over the nose go back to the fur, so that no flat light square shows.

**Seat.** The thighs slope 15 degrees down and 8 degrees out in the bind, and the shins lean 12
degrees forward (`legTurns` of the config). The front of the seat lies 0.05 units behind the knee
joint of the bind. 52 % of the thigh lies on the seat, and the seat height of the app is 0.266 m
(0.262 m on the rabbit of main).

**Belly.** The key `bind_belly` relaxes the posed bind of the 19 vertices with a rest height
(Blender z) from 0.33 to 0.42, rest y below 0, and atan2(|x|, -y) at most 60 degrees, in 3 rounds
of P += 0.5 ((mid - P) . n) n (the rule of the first fox). No belly face points down by more than
30 degrees (largest 28.8, 62.5 before).

**Lids.** A lid on each eye: 14 × 13 points from psi -60 to 60 degrees and lam -40 to 70 degrees
(40 degrees in and 70 out, the right lid mirrors the range) at 1.17 ball radii, and a lower strip
at 1.07 radii (the ball reaches 1.051 radii), 156 quads on each side, held turned up 126 degrees
into the head. The property `lids` holds the angle 2.199115 and the hinge axes, left (0.942765,
0.333458, 0) and right (0.944886, -0.327399, 0). The lid faces take the UVs of the clean fur patch
at UV (0.8693, 0.8285) at 0.99 UV for each unit, and the row `head` 1. In the 21 steps of the blink
no open lid point, side edge, or back edge leaves the head. With lam from -64 to 64 degrees, up to
6 points of the outer side edge left the head, because the head lies close over the outer side of
each ball. With the larger eyes of the cute step and 70 degrees in, the open lid reached over the
middle plane to the other eye. The skin of the upper lid takes no turn, so the opening in the front view reaches 48.5
degrees up. With a turn of 8 degrees down, the lid line covered the top of the iris.

**Color map.** `tools/rabbit-maps.py` writes `rabbit-color.webp` and `rabbit-normal.webp` from the
source maps and the rig file:

```text
uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/rabbit-maps.py
```

It moves the cream fur from sRGB (222, 189, 155) to Oklab L 0.87, C 0.045, h 70 (`FUR`), keeps the
pink, the white, the black, and the eyeballs, and keeps the eye paint of the source with each
iris moved to the middle of its opening ("Eyes" above). The median
Oklab L, C, and h of the cream fur in the seated front view with no fill light at the frog are L
0.849, C 0.062, h 75.2 with the fur L 0.90, against L 0.747, C 0.055, h 71.1 on the rabbit of main,
and in the hall view (`close-views play --at rabbit --no-fill --pause --time 6`) the fur of the
chest, belly, and thigh is L 0.60, C 0.078, h 57 (the rabbit of main stands at that time, so its
pose and light differ). The target lies between the two views.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/rabbit-color.webp` | 77,990 bytes | `1c929460082c595e4b22947c3cddd8bb6fac88124df115595a26743e565d9983` |
| `tripo-hand/rabbit-normal.webp` | 24,694 bytes | `71551c8613a7f9908945d492d34da22209dca1a54f043a22bf77397799c4e749` |

**Normal map.** Each x, y tilt of the normal map of the FBX limited to 0.2 (0.61 % of the
texels), a box scale to 1024 pixels, the tilts times 4 (`NORMAL_MAP_GAIN` of `src/scene/fur.ts`)
in red and green, 255 in blue, and `cwebp -q 60 -sharp_yuv -m 6` (libwebp 1.5.0). The mean
normal of the source is (0.001, -0.003, 0.993), and 12 texels have z below 0.

### History

The first Tripo P2 rabbit (FBX SHA-256
`6ee4f87a767c16e80576e976244b013391857b53ef33e4a59996a6f120a85c44`) had a hand rig made in a live
Blender through the Blender MCP tools: arm and knee rings, the left paw turned 5 ring steps of
360/11 degrees, the bind with no supination, the crease 55, a Taubin relax, a seat with 64 % of
the thigh on it, the key `bind_belly`, its own eyes with blink lids, and the color map and normal
map of its FBX. The new mesh comes from a new turnaround sheet with a cuter form, and the steps
above repeat that work on it in headless Blender. The old files and the steps of each edit are in
the git history of this folder, at a385ad8ba^.
