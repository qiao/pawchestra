# Rhino model

This folder holds the T-pose source mesh of the rhino, a copy with rebuilt arms and its weights,
a copy with no turned faces at the left arm root, and the rigged copy. The app does not serve these files. It loads the module
`src/models/studio/rhino.ts`, which this chain writes:

```text
rhino-tpose.glb                          source mesh
   │  tools/blender/rhino_tpose_arms.py  rebuilt arms and painted weights
   v
rhino-tpose-arms.glb
  + rhino-tpose-weights.json             `paintedWeights` of tools/mesh-rigs/rhino.json
   │  point edits in Blender             no turned faces at the left root (rhino-tpose-arms-pit.json)
   v
rhino-tpose-arms-pit.glb                 `source` of the same config
   │  pnpm rig-mesh rhino
   v
rhino.rig.glb                            rigged mesh
   │  pnpm studio-body rhino
   v
src/models/studio/rhino.ts               studio body of the app
```

`docs/agents/rigging.md` gives the steps of the chain.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `rhino-tpose.glb` | Source mesh (below) | None |
| `rhino-tpose-arms.glb` | Copy of the source with rebuilt arms. License as the source | `rhino_tpose_arms.py` |
| `rhino-tpose-weights.json` | Weights of the same Blender run. License as the source | `rhino_tpose_arms.py` |
| `rhino-tpose-arms-pit.glb` | Copy of `rhino-tpose-arms.glb` with no turned faces at the left arm root. License as the source | None: point edits in Blender (below) |
| `rhino-tpose-arms-pit.json` | The list of the edits of `rhino-tpose-arms-pit.glb`. License as the source | None |
| `rhino.rig.glb` | Output of the rig. License as the source | `pnpm rig-mesh rhino` |

## rhino-tpose.glb

The mesh has no skeleton. The arms are in a T-pose: level and out to the sides.

| Item | Value |
|---|---|
| Size | 16,784,568 bytes |
| SHA-256 | `581267adaa62e2ea2878fb06ac927e532a02f94c3e8437bbf20004aca0ee9bde` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Khronos glTF Blender I/O v4.3.47 |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,115 triangles and 4,463 vertices with POSITION, NORMAL, TEXCOORD_0, and indices, a base color PNG of 10.7 MB and a metallic-roughness PNG of 5.9 MB. No skin and no animation |

A weld at 1e-5 gives 1,560 vertices.

## rhino-tpose-arms.glb and rhino-tpose-weights.json

| Item | Value |
|---|---|
| `rhino-tpose-arms.glb` | 967,148 bytes, SHA-256 `8f6f5fa8f7e9b835702005fdbd16878a5b7157a85fb977ee7165948879af9fa4` |
| `rhino-tpose-weights.json` | 429,315 bytes, SHA-256 `6a92c6f9719d8c31b9d1d0cca0a5447b915c1a6762e93520832c814091b5a5a5` |
| Weights | The automatic weights of Blender with the Weight Paint fixes of the script, for `paintedWeights` of the config |

The script replaces the faces of each arm from 0.4 of the upper arm to 0.3 of the paw with a quad
tube. It wraps the tube onto the source arm and bridges it to the trunk and to the paw, with the
steps of `bear_arms.py`. The arm faces take the fur color of the source arm, from a bake into a
strip of the atlas. The faces of the paws, the trunk, the legs, and the head are the faces of the
source. A run gives the same bytes:

```bash
blender -b --factory-startup -P tools/blender/rhino_tpose_arms.py
shasum -a 256 assets/models/rhino/*.glb assets/models/rhino/rhino-tpose-weights.json
```

## rhino-tpose-arms-pit.glb

| Item | Value |
|---|---|
| Size | 967,140 bytes |
| SHA-256 | `324d7fe9ee1730a3a752f60061b408f51abc5fdf5897f10bca76b8119d00b62e` |
| Writer | Khronos glTF Blender I/O v5.2.40 |

At the top front of the left arm root of `rhino-tpose-arms.glb`, one face between the bridge of the
tube and the trunk turned over in the bind: a dark back face with a slit, about 1.3 cm, that grew
to about 5 cm with folded faces in the play. At the back of the same root, a thin face folded into
a fin of about 3.5 cm in each moment of the tuba.

The copy removes them with 2 point edits in the live Blender on the welded mesh. Each edit merges
one vertex into a neighbor vertex at the place of that neighbor, so that no vertex goes to a new
place. `rhino-tpose-arms-pit.json` lists the merges: the trunk corner of the turned face into the
trunk vertex above it (0.016 units), and the root vertex of the fin into its neighbor on the
root (0.014 units). The copy has 1,939 vertices and 3,873 triangles after the weld (1,941 and
3,877 before): 4 faces go, and each other face keeps the UVs of its own corners. Each merged
corner takes the weight row of its new vertex in `rhino-tpose-weights.json`.

## rhino.rig.glb

| Item | Value |
|---|---|
| Size | 741,720 bytes |
| SHA-256 | `3aaf2129972bf34253ed1ad29861f2d463fdb5fe8ec1713b1eebdba79c223475` |
| Smooth | The source has a ledge around the back and the sides of the neck and a ledge around the top of each thigh, which showed as hard step rings. Three rules of `smooth` of the config relax the source before the weights: a neck box (57 vertices, 0.023 units at most) that keeps the chin and the throat, so that H stays, and two thigh boxes with no vertex of the middle plane (54 and 49 vertices, 0.035 units at most). The rhino stands, and the shapes `legs_straight` give the source form back, so a relax of the seated bind does not reach the standing body |
| Bind | The role-neutral bind (design 4.4): the arms of the source, straight (`studio.straightArms` of the config), with the elbow axes of the old bind with the elbows bent forward (`studio.bindArms`). The left bind paw is supinated by the rule of the cast matrix and the tuba. The right bind paw keeps no supination, because the value of the rule takes the right forearm deeper into the tuba (`studio.bindSupination`) |
| Shapes | The arm-down shape of each arm, the straight legs of each side, and a `raise` shape of each bent elbow of the tuba hold |

A run of `pnpm rig-mesh rhino` gives the same bytes.
