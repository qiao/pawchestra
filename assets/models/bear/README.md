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

`tripo-p2/` holds the source of a candidate body: the Tripo P2 mesh `tripo-p2/bear.fbx` with its
maps.

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/bear.fbx`, `tripo-p2/bear.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |

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
