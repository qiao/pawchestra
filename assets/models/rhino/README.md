# Rhino model

This folder holds the T-pose source mesh of the rhino, a copy with rebuilt arms and its weights,
and the rigged copy. The app does not serve these files. It loads the module
`src/models/studio/rhino.ts`, which this chain writes:

```text
rhino-tpose.glb                          source mesh
   │  tools/blender/rhino_tpose_arms.py  rebuilt arms and painted weights
   v
rhino-tpose-arms.glb                     `source` of tools/mesh-rigs/rhino.json
  + rhino-tpose-weights.json             `paintedWeights` of the same config
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

## rhino.rig.glb

| Item | Value |
|---|---|
| Size | 742,196 bytes |
| SHA-256 | `55890747c98b59e5f9d913df608e049fd4e5d83e60cab8306453950797d58a2b` |
| Bind | The role-neutral bind (design 4.4): the arms of the source, straight (`studio.straightArms` of the config), with the elbow axes of the old bind with the elbows bent forward (`studio.bindArms`). The left bind paw is supinated by the rule of the cast matrix and the tuba. The right bind paw keeps no supination, because the value of the rule takes the right forearm deeper into the tuba (`studio.bindSupination`) |
| Shapes | The arm-down shape of each arm, the straight legs of each side, and a `raise` shape of each bent elbow of the tuba hold |

A run of `pnpm rig-mesh rhino` gives the same bytes.
