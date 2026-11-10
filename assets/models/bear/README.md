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
| Size | 341,198 bytes |
| SHA-256 | `2b0e7cf4b549e999be39c28869003122956b69153fd70fb25435329f0f5b2537` |
| Origin | Made by hand in Blender 5.2 from `tripo-p2/bear.fbx` |
| License | CC BY-NC 4.0, as the FBX file |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the ear tips, the soles at z = 0, the bear faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `bear`: 2,897 vertices and 3,080 faces (2,516 quads and 564 triangles, 5,596 triangles), flat faces, and the surface of `sa.add_surface()`. 60 faces are gloss (the nose). The two eyeballs of the source sit in their sockets, and their 80 faces have the face attribute `eye`. The UV map of the FBX |
| Armature | `bear_rig`: the 30 body bones and the 20 arm segments and helpers of the simple route, at the joints of `tools/mesh-rigs/simple/bear-tripo.json` (shoulder x 0.15, elbow 0.27, wrist 0.365, knuckles 0.43). The Action `bind` holds the standing bind of that config: no leg turn, no trunk recline, straight arms, and no bind supination. The properties `palm`, `seat`, and `hinges` come from `sa.build_armature()` |
| Facts | `height` 1.108447 (the shoulder joints at 0.669 u, 1.656871 m for each unit, so that H stays 0.357761 m, the H of the bear of `bear-tpose.rig.glb`), `crease` 40 and `colorBlend` 0.05 (the values of that bear) |
| Eyes | The eyeballs of the mesh. No eye objects, so the app adds no bead eyes |

The export of the file. License of both files: CC BY-NC 4.0, as the FBX file.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/bear.rig.glb` | 690,756 bytes | `32bb6dc2e55299f437d64b40ecc5dc444a8b34e593bcef563b14f5661927c1de` |
| `tripo-hand/bear.rig.json` | 8,931 bytes | `4d539628817a41f7044d47e3e17f490f01d1ad5bcd5367c8ac753185e24a79f1` |

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
file has no shape key, no key `bind*`, and no key `arm_raise_*`.
