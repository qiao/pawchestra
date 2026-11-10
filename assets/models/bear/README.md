# Bear model

This folder holds the T-pose source mesh of the bear, a copy with rebuilt arms and its weights,
and the rigged copy. The bear is the conductor. The app does not serve these files. It loads the
module `src/models/studio/bear.ts`, which this chain writes:

```text
bear-tpose.glb                     source mesh
   │  tools/blender/bear_arms.py   rebuilt arms and painted weights
   v
bear-arms.glb + bear-weights.json  `source` and `paintedWeights` of tools/mesh-rigs/bear.json
   │  pnpm rig-mesh bear
   v
bear-tpose.rig.glb                 rigged mesh
   │  pnpm studio-body bear
   v
src/models/studio/bear.ts          studio body of the app
```

`docs/agents/rigging.md` gives the steps of the chain.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `bear-tpose.glb` | Source mesh (below) | None |
| `bear-arms.glb` | Copy of `bear-tpose.glb` with rebuilt arms. License as the source | `bear_arms.py` |
| `bear-weights.json` | Weights of the same Blender run. License as the source | `bear_arms.py` |
| `bear-tpose.rig.glb` | Output of the rig. License as the source | `pnpm rig-mesh bear` |

## bear-tpose.glb

The mesh has no skeleton. The arms are in a T-pose: out to the sides and a little down, free of
the trunk.

| Item | Value |
|---|---|
| Size | 15,839,832 bytes |
| SHA-256 | `adf2a4028fb286f90a009fb75a20215e68af4305f261e1c3f8c4c658fe242896` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Khronos glTF Blender I/O v4.3.47 |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,142 triangles and 4,237 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |
| Material | One material `BakedMaterial` with two PNG textures (10.2 MB and 5.5 MB) |

With a weld at 1e-5, in the units of the studio, the mesh has 1,573 vertices in one part, no open
edge, and 105 faces with a corner angle below 10°. The box is x -0.502 to 0.502, y 0 to 1, and
z -0.221 to 0.220. Each arm is free of the trunk beyond x 0.18, from y 0.58 to 0.75.

## bear-arms.glb and bear-weights.json

| Item | Value |
|---|---|
| `bear-arms.glb` | 874,864 bytes, SHA-256 `128b7d5483003962dd6bd0feecf06fffd88a66191ba1fca6bad85cb86d658375` |
| Mesh | 3,846 triangles: on each arm a tube of 13 rings of 16 vertices, joined to the trunk and the paw with Bridge Edge Loops |
| Material | One material with one base color JPEG of 4096 × 4608 pixels: the atlas of the source, and a strip of 512 pixels on top with the fur color of the source arms, baked onto the new faces. No metallic-roughness texture |
| `bear-weights.json` | 428,745 bytes, SHA-256 `97b30e46d7629af1702b932a5954154f843d77a899591d97a8eb9b61f0bb7415` |
| Weights | The automatic weights of Blender with the Weight Paint fixes of the script, on the studio bones and the arm segments and helpers (`armSegments` of the config), for `paintedWeights` of the config |

The script puts new quad faces on each arm from the shoulder line to the wrist, because the long
thin faces of the source arm folded into shards under the bent elbow. The faces of the paws, the
trunk, the legs, and the head are the faces of the source. The new arm surface lies on the old
one, with the arm length of the source.

- **Flatten.** The inner side of each upper arm is a little flatter, so that it stays out of the
  round belly. The flatten comes after the bake, so that each texel takes the fur of its own place
  on the source arm. A flatten before the bake moves the tube out of the reach of the bake rays,
  and the bake then writes black texels under the armpits.
- **Wrist.** The wrist cut stands parallel to the last ring. Smooth Vertices and a Shrinkwrap
  even the band of each wrist (`cut_planes()` and `step_smooth_wrist()`), as on the polar bear. A
  cut at a right angle to the paw makes the band thin on the palm side, and its sharp edges show
  as a notch on the top of each wrist.

A run gives the same bytes:

```bash
blender -b --factory-startup -P tools/blender/bear_arms.py
shasum -a 256 assets/models/bear/*.glb assets/models/bear/bear-weights.json
```

## bear-tpose.rig.glb

| Item | Value |
|---|---|
| Size | 618,400 bytes |
| SHA-256 | `73af414fe49f7760d25843c10bb5db62037d40843a9a8ee2fff7c017d4fd5b56` |
| Bind | The role-neutral bind (design 4.4): the arms of the source, straight (`studio.straightArms` of the config): the elbow and the wrist keep the angles of the source. The right bind paw is supinated by the rule of the cast matrix. The left bind paw takes a smaller supination, because the value of the rule dents the left forearm of the conductor (`studio.bindSupination`). The skin of each forearm and wrist takes the skin normals (`rootNormals.wrist`) |
| Shapes | The arm-down shape of each arm, the straight legs of each side, and a `raise` shape of each bent elbow |

A run of `pnpm rig-mesh bear` gives the same bytes.

## Candidate hand rig

`tripo-hand/` holds a candidate body ("tripo-hand/bear.blend" below): a hand rig of the Tripo P2
mesh `tripo-p2/bear.fbx`, made in a live Blender with no arm cut and no limb stretch. On the
branch of the candidate, the `ANIMALS` entry of the bear points to `tripo-hand/bear.rig.glb`.

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/bear.fbx`, `tripo-p2/bear.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |
| `tripo-hand/bear.blend` | Made by hand in Blender 5.2 from `tripo-p2/bear.fbx` (below). License as the FBX file | None: edit it in Blender |
| `tripo-hand/bear.rig.glb` | Export of `tripo-hand/bear.blend`. License as the FBX file | `pnpm rig-export bear --blend assets/models/bear/tripo-hand/bear.blend --out assets/models/bear/tripo-hand/bear.rig.glb` |
| `tripo-hand/bear.rig.json` | Text summary of the export, for diffs | The same run |
| `tripo-hand/bear-color.webp` | The color map of the FBX in the brown of the bear of main ("Color map" below). License as the FBX file | `uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/bear-maps.py` |
| `tripo-hand/bear-normal.webp` | The normal map of the FBX for the fur shading ("Normal map" below). License as the FBX file | The steps of "Normal map" |

### tripo-p2/bear.fbx

A brown bear in a T-pose, made with Tripo P2: quad faces, and arm and leg tubes of 18 vertices
around. The FBX file keeps the quads. The folder `bear.fbm/` holds its color map and its normal
map.

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary |
| Contents | One mesh object, with no armature and no animation. 2,717 vertices and 2,900 faces: 2,336 quads and 564 triangles (5,236 triangles), no n-gon. One UV layer |
| Parts | 22 parts: the body (2,088 vertices), two eyeballs (41 vertices each), the tail ball (51 vertices), five claws on each paw (28 vertices each), and four claws on each foot (27 vertices each). No vertices merge at 1e-5. The 156 open edges are the open root loops of the claws, the tail ball, and the eyeballs. No edge has more than two faces |
| Box | In the studio units (1 unit from the soles to the ear tips): x ±0.4966 (the claw tips of the paws), and z -0.2303 (the tail ball) to 0.2303 (the belly). The bear faces -y in Blender |

The Tripo download names the maps by their job. The copy gives them the names of the species,
and leaves out the roughness map (`bear_roughness.JPEG`) and the metallic map
(`bear_metallic.JPEG`). The FBX file still names the maps of the download. No step reads the
material of the FBX file: `sa.import_source()` keeps only the mesh and its UVs.

| File | Name in the download | Size | Pixels | SHA-256 |
|---|---|---|---|---|
| `bear.fbx` | `tripo_convert_8ef16b57-d21b-4b3f-9cbf-02d63e935668.fbx` | 187,036 bytes | | `0eaaf5e5a4afcfdc3daf43031433c96558482c9e5f1f7f40c37e8856688a1dbc` |
| `bear.fbm/bear_basecolor.jpg` | `tripo_rgb_78a1f9d0-753e-4381-90e8-663ab5ba5049.jpg` | 3,396,472 bytes | 4096 × 4096 | `84f0807f254aaa366d32796545a35b7a1c5eb5ba79316d94f13494131ab57be7` |
| `bear.fbm/bear_normal.jpg` | `tripo_normal_b737a6d9-0904-4602-a807-ec24bf9e02f9.jpg` | 1,772,996 bytes | 4096 × 4096 | `fdae5918b0d09a6c76110d5a6e4da4955fad2794e283a3ab80ff8c792937cf1f` |

The color map paints a full eye on each eyeball: a black pupil, a dark iris, a white light, and
a light rim. The fur is orange brown, the muzzle is light tan, and the nose and the claws are
dark brown. The map paints no pads on the paws.

### tripo-hand/bear.blend

The candidate hand rig of the Tripo P2 mesh (design 4.4, "Hand rig"), made in a live Blender 5.2
through the Blender MCP tools, in a scene `bear` of its own. The arms and the legs keep the form
and the length of the source: no cut, no split from the trunk, and no stretch.

| Item | Value |
|---|---|
| Size | 361,103 bytes |
| SHA-256 | `995a0d7b554c12c2ee1de147bbb6bf7c69cbccef4a2b0f01703437d183060662` |
| Origin | Made by hand in Blender 5.2 from `tripo-p2/bear.fbx` |
| License | CC BY-NC 4.0, as the FBX file |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the ear tips, the soles at z = 0, the bear faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `bear`: 3,261 vertices and 3,392 faces (2,828 quads and 564 triangles, 6,220 triangles), flat faces, and the surface of `sa.add_surface()` with one color for each region ("Smooth surface" below). 46 faces are gloss (the nose). The two eyeballs of the source sit in their sockets, and their 80 faces have the face attribute `eye` ("Eyes" below). A lid on each eye: 312 quads with the face attribute `lid` ("Lids" below). The UV map of the FBX, and the custom property `texture` (`assets/models/bear/tripo-hand/bear-color.webp`) |
| Armature | `bear_rig`: the 30 body bones and the 20 arm segments and helpers of the simple route, at the joints of `tools/mesh-rigs/simple/bear-tripo.json` (shoulder x 0.15, elbow 0.27, wrist 0.365, knuckles 0.43). The Action `bind` holds the standing bind of that config: no leg turn, no trunk recline, straight arms, and no bind supination. The property `palm` holds a palm for each side ("Arm twist" below), and the property `lids` the turn and the hinge axes of the lids. The properties `seat` and `hinges` come from `sa.build_armature()` |
| Facts | `height` 1.108447 (the shoulder joints at 0.669 u, 1.656871 m for each unit, so that H stays 0.357761 m, the H of the bear of `bear-tpose.rig.glb`), `crease` 40 and `colorBlend` 0.05 (the values of that bear) |
| Eyes | The eyeballs of the mesh, with the `eye` finish and the eye light of the app. No eye objects, so the app adds no bead eyes. A lid on each eye blinks |

The export of the file. License of both files: CC BY-NC 4.0, as the FBX file.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/bear.rig.glb` | 711,660 bytes | `4fcea8740d6c9b07c458031c5042a51027dcfdb8ede4c9ff2a24038feb7adb47` |
| `tripo-hand/bear.rig.json` | 16,084 bytes | `9dccc5e529e3a40fed775cc0e570ade638d5c224a173cc897f704fcf46caee07` |

The edits, in the order of the work:

- **Import.** `sa.import_source('assets/models/bear/tripo-p2/bear.fbx', 1e-5)` in the new scene
  `bear`: no vertex merges, 1 unit from the soles to the ear tips.
- **Joints.** The FBX has no armature, so each joint comes from cuts of the mesh and from its
  edge loops (`jointsNote` of the config).
- **Arm rings.** Edge ring Subdivide (`bmesh.ops.subdivide_edges(bm, edges=<ring>, cuts=1,
  use_grid_fill=True)`) of the clean quad edge ring of 18 edges between two arm rings. The bands,
  by the x of their rings on the left arm: 0.2504 to 0.2773, 0.2773 to 0.3029, and 0.3029 to
  0.3403 (the right arm at 0.2518 to 0.2776, 0.2776 to 0.303, and 0.303 to 0.3405). The new rings
  lie at x 0.264, 0.290, and 0.322. Each arm now has rings at x 0.1756, 0.2053, 0.2504, 0.264,
  0.2773, 0.2902, 0.3029, 0.3217, and 0.3403: from x 0.25 to the wrist, a ring each 0.19 to 0.31
  arm radii (radius 0.073 to 0.063).
- **Knee rings.** The same call with 2 cuts on the clean leg band of 18 edges at y 0.1037 to
  0.1611 of each leg. The knee joint is at y 0.13, and the knee has rings at y 0.104, 0.123,
  0.142, and 0.161.
- **Rings with no split.** These edge rings stop at a triangle or a pole, so they take no split:
  the arm root bands at x 0.1756 to 0.2053 (3 triangles, poles 1741, 1744, 1746 on the left) and
  0.2053 to 0.2504 (1 triangle, poles 1741, 1746, 2158), the wrist band at x 0.3403 to 0.3779
  (poles 2181, 2661), the paw bands from x 0.3779 (triangles and poles at the claw roots), the
  leg band at y 0.1611 to 0.1963 (one triangle), and the foot bands below y 0.04 (triangles and
  poles at the toes). The upper arm thus has 0.41 and 0.62 arm radii between its root rings. The
  clean ankle band at y 0.069 to 0.104 lies at no knee, so it takes no split.
- **Surface.** `sa.add_surface(bear, 'bear', 'assets/models/bear/tripo-p2/bear.fbm/bear_basecolor.jpg',
  eye_fans=False, config=<bear-tripo.json>)` on the flat mesh. 60 faces of the dark brown nose
  are gloss. The faces of the eyeballs took the fur color.
- **Eyes.** The 80 faces of the two eyeballs get the face attribute `eye` (BOOLEAN, FACE) and the
  colors `color` and `color_base` `#15110e` (the eye color of the app). The export then gives
  `ownEyes`, and the app adds no bead eyes. The eyeballs keep the slot `fur`. The color map
  paints a full eye on each eyeball ("tripo-p2/bear.fbx"), so the body keeps its own eyes.

The weights, in the order of the work, in the rest pose:

1. Parent with Automatic Weights, then Limit Total 4 and Normalize All (`sa.skin_mesh(bear,
   bear_rig, auto=True)`). No vertex took no weight.
2. Arm rings: each vertex ring of each arm from x 0.1756 to x 0.3403 takes one exact row with
   `sa.set_weight_row()`. A row holds a clavicle share, an elbow helper share, and a wrist helper
   share, linear between the control rings below (x of the left arm). The rest of the row goes to
   the 4 roll segments of the upper arm (x below 0.27) or of the forearm, by the x of the ring
   along the bone: segment k takes the share at (k + 0.5) / 4 of the part, with a linear ramp
   between two segments (the roll split of the simple route).

   | x | 0.1756 | 0.2053 | 0.2504 | 0.264 | 0.2773 | 0.2902 | 0.3029 | 0.3403 |
   |---|---|---|---|---|---|---|---|---|
   | Clavicle | 0.40 | 0.20 | 0.05 | 0 | 0 | 0 | 0 | 0 |
   | Elbow helper | 0 | 0 | 0.25 | 0.75 | 0.75 | 0.25 | 0 | 0 |
   | Wrist helper | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.25 |

   The ring at x 0.3217 takes the linear values between its neighbors: the wrist helper 0.126.
   The trunk loop
   around each arm root keeps the automatic weights.
3. Paws, by rows across the paw, by the place along the rest forearm axis (from the forearm head
   to the paw head, as the x of the axis point of the left paw): 0.352 to 0.372 {`wrist` 0.75,
   `forearm_seg3` 0.25}, 0.372 to 0.392 {`wrist` 0.5, `hand` 0.5}, 0.392 to 0.42 {`hand` 1}, the
   knuckle row 0.42 to 0.44 {`hand` 0.5, `fingers` 0.5}, and from 0.44 {`fingers` 1}.
4. The loose parts follow one bone each: the 82 vertices of the eyeballs {`head` 1}, the 51
   vertices of the tail ball {`tail` 1}, the 10 paw claws (280 vertices) {`fingers` 1} of their
   side, and the 8 foot claws (216 vertices) {`toes` 1} of their side. A claw on the head bone
   would stay behind when the paw moves.

The trunk, the neck, the head, the ears, the hips, and the legs keep the automatic weights. The
lids take the row `head` 1 ("Lids" below). The file has no shape key, no key `bind*`, and no key
`arm_raise_*`.

**Arm twist.** In the moments of the conductor, the roll of each upper arm skin (from the
clavicle) and the twist of each forearm skin (from the upper arm) reached 108.7° (the right
forearm), and the left forearm turned 94° from the ready gesture to the quiet place. These
changes make each part take 36.3° or less:

- **Paws turned.** Each vertex past the arm loop at |x| 0.3215 (the loop stays), with the loose
  claws of its side, turns rigidly about the rest forearm axis (from the head of `forearm_<side>`
  to the head of `hand_<side>`) by whole loop steps of 20°: -80° on the left (4 steps) and 40° on
  the right (2 steps), 290 vertices on each side. The 18 quads from that loop to the next loop go,
  and new quads join the loop to the turned loop with the same step offset, with the colors, the
  face attributes, and the UVs of the old quads. The bones `hand_<side>` and `fingers_<side>` turn
  with the paw.
- **Palms.** The property `palm` holds the source palm of each side, (0, -0.0995, -0.995) with x
  mirrored on the right, turned by the same angle about the same axis: left (-0.103033, -0.991788,
  -0.075769), right (0.074176, -0.711415, -0.698846). Then `sa.fix_rolls()`, and each key of the
  Action `bind` again with the same world turn of its bone from the rest (supination 0).
- **Wrist relax.** The wrist loops are ovals (0.054 by 0.071 units), so the joined band was
  sheared and showed a dark slit on the left forearm in the play. Ten Taubin rounds (0.5, then
  -0.53) on the 113 vertices at |x| 0.295 to 0.365 above z 0.55, with the claws held, move each
  vertex at most 0.008 units.
- **Hold.** `CONDUCTOR_HOLD` of `src/pose/conductor.ts` takes the baton roll of a true palm, a
  ready roll of the left paw, and a rest pose with the arms beside the belly (its comments give
  the values).

The roll of the upper arm and the twist of the forearm, in degrees, before (the r3 rig with the
hold of main) and after (`pose-preview` and `twists()` of the session):

| Moment | Left upper arm | Left forearm | Right upper arm | Right forearm |
|---|---|---|---|---|
| beat-1 (ready) | -16.7 / -16.7 | -7.5 / 13.9 | 25.1 / 24.9 | 84.8 / 2.8 |
| between | -13.5 / -13.5 | -48.5 / -5.8 | 27.9 / 27.8 | 95.6 / 14.6 |
| beat-2 | -14.7 / -14.7 | -92.6 / -19.7 | 26.5 / 26.3 | 96.6 / 14.4 |
| beat-3 | -13.9 / -13.9 | -96.2 / -20.4 | 25.2 / 25.0 | 73.8 / -4.2 |
| rest | 53.4 / 30.2 | -84.5 / 34.3 | -50.6 / -34.8 | 80.0 / -0.8 |
| cue (25 s) | -16.7 / -16.7 | -41.5 / 32.8 | 31.1 / 30.9 | 87.1 / 3.9 |
| largest of all samples | 53.4 / 32.4 | 99.5 / 36.3 | 50.6 / 34.8 | 108.7 / 28.2 |

The samples are the moments of the role and 21 times of `mozart-k525.mid` (0 s to 90 s and the
song end), and 10 times each of `beethoven-9`, `brahms-2`, `bach-bwv1048`, and
`mendelssohn-op61`. The values after are those of the final file, after "Form".

**Smooth surface.**

- **One color for each region.** The face colors of `add_surface()` took the shade that the
  Tripo texture bakes, so the belly and the chest showed a mosaic of 16 fur tones. Each face takes
  the color of its region, by the HLS lightness of its old color and its part: the fur (L 0.3 to
  0.55, and the tail ball), the muzzle (L above 0.55), the mouth (the pink faces under the nose),
  the claws (the loose claws), and the gloss nose. The fur and the muzzle take the color of their
  face at 0.6 of their luma range, and the claws and the nose their median face. "Color map" gives
  the colors.
- **Crease 40.** The limb loops have 18 vertices, 20° apart, so the crease 40 of the bear of main
  is enough. The share of the faces with a facet corner (`studioNormals()`), at the crease 40:
  head 20.4 %, ears 41.1 %, trunk 13.2 %, arms 19.0 %, paws 62.4 %, legs 4.2 %, feet 72.3 %,
  against 64.3, 50.1, 22.6, 25.4, 86.1, 58.9, and 94.9 % on the bear of main.
- **Relax.** Ten Taubin rounds (0.5, then -0.53) on the body, with each move clipped to 0.01
  units, move the vertices by 0.0027 units on average. The gloss nose, the four top vertices of
  the head, and the six lowest vertices of the chin stay, so H stays 0.357761 m. The mean fold
  between neighbor faces goes from 21.9° to 16.1° on the paws, from 20.2° to 18.2° on the head,
  and from 18.9° to 16.5° on the legs. The bones and the weights stay.

**Form.** The bear stands on the podium with its feet flat: 97 sole vertices lie below z 0.012.
Its center of mass (the volume of the body part) lies at y -0.010, inside the soles (y -0.129 to
0.096). Sections of both rig files in their rest (`form.py` of the session), as a share of H:

| Part | Before | After | Bear of main |
|---|---|---|---|
| Upper arm girth, t 0.6 to 0.9 | 2.23 to 2.12 | 2.12 to 1.91 | 2.01 to 1.93 |
| Forearm girth, t 0.3 to 0.8 | 2.03 to 1.79 | 1.77 to 1.63 | 1.77 to 1.61 |
| Shin girth, t 0.3 to 0.6 | 2.43 to 2.38 | 2.16 to 2.07 | 2.07 to 1.96 |
| Paw length, width, depth | 0.610, 0.797, 0.455 | 0.439, 0.599, 0.392 | 0.440, 0.566, 0.388 |
| Height to the ear tips | 4.637 | 4.637 | 4.254 |

A point edit in the live Blender (`arm_paw_moves()` and `shin_moves()` of the session) moves
1,100 vertices, at most 0.041 units:

- Each arm vertex (|x| above 0.17, z above 0.45, up to the wrist joint) moves toward the middle of
  its section (the mean of the arm vertices within 0.006 units of its x), in the plane square to
  x, by the scale 1, 0.86, 0.87, 0.86, 0.86 at |x| 0.19, 0.23, 0.27, 0.30, 0.365 (smoothstep
  between them), times its share of the arm bones.
- Each paw vertex past the wrist joint (the head of `hand_<side>`), with the claws, maps in the
  frame of its paw: a the rest forearm axis, w the width axis (the first principal axis of the paw
  across a), n = a × w, about the middle line of the wrist section. The point takes 0.72 d along
  a, and across a the scale goes from 0.86 at the wrist to 0.66 (w) and 0.86 (n) over d 0 to
  0.025 by a smoothstep. The tails of `hand_<side>` and both ends of `fingers_<side>` take the
  map. The wrist joints stay.
- Each leg vertex from z 0.035 to 0.17 moves toward the middle of its leg section (the mean of
  the leg vertices within 0.005 units of its z) by the scale 1, 0.86, 0.86, 1 at z 0.035, 0.06,
  0.13, 0.17 (smoothstep).

The legs show no flare at the knee. The rest pose hangs the thinner arms beside the belly, and
each arm part still takes 36.3° or less.

**Color map.** The app shows the color map of the FBX on the candidate, in place of the face
colors (design 4.5). `tools/bear-maps.py` writes it: a Lanczos scale of `bear_basecolor.jpg` to
2048 pixels, then a move in Oklab of each texel of the fur triangles and of the muzzle triangles
of the rig file (the region of a triangle is its face color). The lightness and the chroma scale
by the ratios of the median source color of the region to its target, and the hue turns by their
hue step, so each strand keeps its contrast. The gutters of the atlas take the fur step. The fur
goes from sRGB (160, 87, 36) to the fur face color of the bear of main, (95, 60, 32), and the
muzzle from (232, 152, 89) to the light muzzle of main, (234, 192, 148). The mouth line and the
claws keep their colors. The eyes take the eye color of the app ("Eyes" below).

An offset step (the anchors of `tools/fox-maps.py`) did not work for the bear: the source belly
and back are lighter than its sides, those texels took a part of the muzzle step, and the back
stayed light in the hall view for each fur target.

In the hall view from the back (`close-views play --demo mozart-k525 --time 12 --no-fill` with
the camera `back` of `scratch/bear/cams.json`, the box x 0.40 to 0.56, y 0.42 to 0.62 on the
back), the median Oklab L, C, and h:

| Fur | L | C | h |
|---|---|---|---|
| Face colors of round 5 (no map) | 0.624 | 0.121 | 47 |
| Map with the offset step to L 0.40 | 0.587 | 0.105 | 50 |
| Map with the offset step to L 0.24 | 0.520 | 0.099 | 49 |
| `bear-color.webp` (the scale step) | 0.484 | 0.091 | 50 |
| Bear of main | 0.477 | 0.090 | 49 |

The face colors before the map loads take the median of the map in each region: fur (123, 72,
31), muzzle (230, 184, 139), mouth (161, 83, 67), claws (80, 54, 32). The gloss nose takes the
near black of the nose of main, (24, 20, 18). 14 faces at the edge of the gloss nose (source luma
100 or more, most on its right side) take the slot fur and the muzzle color, so the map paints
them light and no dark wedge shows under the nose. The scale step needs the fur sheen of the
luma (`fullLuma` of `FUR_LOOK`, design 4.5). The texture points of the studio module add 18.0 KB
to the first download (655,887 to 673,885 bytes after gzip, `pnpm size`), and the lids 1.9 KB
more. The images load after the first frame.

| Item | Value |
|---|---|
| Source | `tripo-p2/bear.fbm/bear_basecolor.jpg` (above) |
| `bear-color.webp` | 2048 × 2048, WebP quality 60 (Pillow 13.0.0, method 6): 109,396 bytes, SHA-256 `5cfc2618dba18691e8c36608409f34f9ab7a6178da8ecf3c9ff160acda927531` |
| Origin, license | As the FBX file |

**Eyes.** The source paints a white ball with a black pupil and a white light on each eyeball.
The ball sits in its socket, so a white crescent of the ball showed beside the pupil, and in the
hall light the eyes read startled. The eye was also small: about 0.8 of the width and 0.6 of the
height of the pea eye of main. Two changes give a calm, happy face:

- **Dark eyes.** `tools/bear-maps.py` gives each eye texel lighter than Oklab L 0.3 the eye color
  of the app (#15110e), and the black pupil keeps its color. The eye light of the app gives each
  ball its soft light, as on the bead eyes of main.
- **Size.** A point edit in the live Blender (`eye_moves(1.35, 0)` of the session) scales each
  eyeball by 1.35 about the middle of its sphere (left (0.0379, -0.1123, 0.8939)), and moves each
  other vertex of its side, except the gloss nose, from that middle by 1.35 up to 0.028 units,
  with a smoothstep back to 1 at 0.052 units: 242 vertices, at most 0.0104 units. The ball radius
  is now 0.0246. A lineup of 1.0, 1.2, and 1.35 against main (`reports/2026-11-10-bear-hand-r8/`,
  which git ignores) put 1.35 nearest to the eye of main. A turn of the ball 10° down showed the
  white crescent above the pupil.

Each eyeball is open at the back, so its axis of the vector area lies 6.9° from its visible axis
g, and the eye light needs no further edit.

**Lids.** A scripted edit in the live Blender adds a lid to each eye, as a separate part, as the
Tripo rabbit and fox have them. In the hinge frame of each eye, g is the mean direction from the
middle of the ball to the ball points that a ray from the middle reaches with no hit on the head
(left (0.492, -0.851, 0.183)), u is +Z made square to g, and h = u × g is the hinge axis (left
(0.865972, 0.500092, 0), right (0.865973, -0.500092, 0)).

1. Each closed lid spans psi from -60° to 60° and lam from -64° to 64° in 12 steps each, at the
   radius 0.031 from the middle of the ball (radius 0.0246). An extra row at psi -60° and the
   radius 0.027 makes a strip at the lower edge that turns in toward the ball. Thus 14 × 13
   vertices and 156 quads on each side, with outward normals.
2. The file holds the open lid: each point turned up by 126° about h. The property `lids` of the
   armature holds `angle` 2.199115 (126°) and the axis h of each side.
3. Each lid face takes the slot `fur`, flat shading, the fur face color, and the face attribute
   `lid`. Each corner takes the UV of the planar projection of its closed point on the plane of h
   and u, at 0.74 UV for each unit (the median density of the fur faces 0.036 to 0.05 units from
   the middle), about the fur patch at UV (0.1612, 0.3661) of Blender (96 px with a deviation of
   2.2 in `bear-color.webp`).
4. Each lid vertex takes the row `head` 1. `pnpm studio-body` moves it onto the eye bone of its
   side.

The head surface lies 0.019 units from the middle at 40° from g, 0.031 at 50°, and 0.039 at 60°.
In 21 steps of the blink, no point of the side edges or of the back edge leaves the head, the
open lid lies at least 0.0174 units under the head, and the lower strip of the closed lid lies
under the head. The renders at the blink peaks of `mozart-k525` (9.44 s and 12.38 s) show both
eyes closed.

**Normal map.** The app tilts the normals of the fur faces with the normal map of the FBX (design
4.5, fur shading). Checks of the source: the mean normal is (0.00, 0.00, 0.99), and 5 texels have
z < 0. On 524 UV seams of the mesh with a tilt of 0.03 or more, the two faces decode normals with
a median gap of 22.1° with the green of OpenGL and 23.2° with the other sign, so the map is
OpenGL, as the maps of the Tripo rabbit and fox. The fur luma of the map is low (about 0.07
linear), so the sheen is weak and the strands show.

| Item | Value |
|---|---|
| Source | `tripo-p2/bear.fbm/bear_normal.jpg` (above) |
| Steps | Limit each x, y tilt to the length 0.2 (0.93 % of the texels). Box scale to 1024 × 1024. Store x and y times 4 (`NORMAL_MAP_GAIN`) in red and green, and 255 in blue. No value clips |
| `bear-normal.webp` | `cwebp -q 60 -sharp_yuv -m 6` (libwebp 1.5.0): 99,184 bytes, SHA-256 `2a76fa1e0046f5473c25e7e596c0b0ee464d5dbb9a253d64d1ec2da2de6b6abe` |
| Origin, license | As the FBX file |

The tilts of the source are larger than on the rabbit and the fox (median 0.023, 99th percentile
0.18).

**Nose facets.** The gloss faces keep a flat normal each (`studioNormals()`), with the sharp
highlight of `lacquer`. The 46 gloss faces of the source nose turn a median 19° (at most 46°)
from their neighbors. Thus in the 2x face crops each small face caught the light or not, and the
top of the nose showed a mosaic of light squares. The map is not the
cause: the gloss corners have no texture points. A point edit in the live Blender makes two
flat facets on the top of the nose, as the large facets of the nose of main:

- Facet A, the faces 1304, 1306, 1307, 2245, 1210, 1211, 1213, 2159 (the top rows), and facet B,
  the faces 1202, 1209, 1212, 2158 (the row below, which faces the camera and the light).
- Each facet plane has x = 0 in its normal (a mirror plane), and fits its vertices by least
  squares. Each of the 20 vertices goes to the least-squares point of the planes of its facets,
  with the weight 0.05 to its old place, in 10 rounds: A normal (0, -0.2938, 0.9559), B normal
  (0, -0.8004, 0.5994). The largest move is 0.0042 units, and no vertex is more than 0.0003 units
  from its planes.

Now the top of the nose shows one even band of light in place of the squares. A fit of all 46
faces to 7 facets moved the edge of the nose by up to 0.0064 units and made it angular, and the
same fit with the edge held turned some triangles over.
