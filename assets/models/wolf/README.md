# Wolf model

This folder holds the source mesh of the wolf, a copy with rebuilt arms and its weights, and the
rigged copy. The app does not serve these files. It loads the module `src/models/studio/wolf.ts`,
which this chain writes:

```text
wolf.glb                               source mesh
   │  tools/blender/wind_arms.py wolf  rebuilt arms and painted weights
   v
wolf-arms.glb + wolf-weights.json      `source` and `paintedWeights` of tools/mesh-rigs/wolf.json
   │  pnpm rig-mesh wolf
   v
wolf.rig.glb                           rigged mesh
   │  pnpm studio-body wolf
   v
src/models/studio/wolf.ts              studio body of the app
```

`docs/agents/rigging.md` gives the steps of the chain.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `wolf.glb` | Source mesh (below) | None |
| `wolf-arms.glb` | Copy of `wolf.glb` with rebuilt arms. License as `wolf.glb` | `wind_arms.py wolf` |
| `wolf-weights.json` | Weights of the same Blender run. License as `wolf.glb` | `wind_arms.py wolf` |
| `wolf.rig.glb` | Output of the rig. License as `wolf.glb` | `pnpm rig-mesh wolf` |

## wolf.glb

| Item | Value |
|---|---|
| Size | 18,480,832 bytes |
| SHA-256 | `d0895416708754880201946d20240202757d5dd7ea45b29a34dcc697f6741aa6` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Khronos glTF Blender I/O v4.3.47 |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,119 triangles and 6,162 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |
| Material | One material `BakedMaterial`, double-sided, with a base color texture (13.2 MB) and a metallic-roughness texture (5.1 MB), each a PNG |

The values below are in the units of the studio: 1 unit from the soles to the tips of the ears,
the soles at y = 0, +z forward, and +x the left side of the animal. The mesh faces +z. The weld is
at 1e-5.

- The weld gives 1,563 vertices in one part. 6 edges are open and 3 edges have more than two
  faces. 352 faces have a corner angle below 10°.
- The box is x -0.231 to 0.230, y 0 to 1, and z -0.200 to 0.197. The wolf is 1.9012 units of the
  file high from the soles to the tips of the ears. The top of the skull is at y 0.946.
- The wolf stands upright on long legs, with the crotch at y 0.30 and dark lower legs and feet.
  The arms hang down, out, and forward. They are apart from the body from x 0.085 out, with the
  dark paws at y 0.38 to 0.45.
- The black nose is at z 0.197 and y 0.817. The eyes are at y 0.85 to 0.86 and z 0.12, with no
  shells. The bushy tail hangs from y 0.40 down to its tip at y 0.081 and z -0.18.

## wolf-arms.glb and wolf-weights.json

| Item | Value |
|---|---|
| `wolf-arms.glb` | 1,324,948 bytes, SHA-256 `1745e2cecd3ab6b0bdfde6d7fb5c5c45bab5b8abc62933fb22c5a5472b6097d7` |
| Mesh | 1,984 vertices after a weld at 1e-5, 3,961 triangles: on each arm a tube of quad rings of 16 vertices, joined to the trunk and the paw with Bridge Edge Loops, with Beautify Faces and Collapse Edges on the bridge triangles |
| Material | One material with one base color JPEG: the atlas of the source, and a strip of 512 pixels on top with the fur color of the source arms, baked onto the new faces. No metallic-roughness texture |
| `wolf-weights.json` | 447,401 bytes, SHA-256 `132b64a348e23d46101924a63bdedb03405ea9ef3b38c4555d4adcc8aba87f8e` |
| Weights | The automatic weights of Blender with the Weight Paint fixes of the script, on the studio bones and the arm segments and helpers (`armSegments` of the config), for `paintedWeights` of the config |

The script puts new quad faces on each arm from the shoulder line to the wrist. The new arm
surface lies on the old one. The arms are 1.178 times longer from the shoulder line, because a rig
with arm segments does not stretch the arms. The faces of the paws, the trunk, the legs, and the
head are the faces of the source. Only the short edges of the thin faces at the cut loops
collapse. The points of the weights file are in the units of the scaled source (`proportions` and
`soften` of the config). A run gives the same bytes:

```bash
blender -b --factory-startup -P tools/blender/wind_arms.py -- wolf
shasum -a 256 assets/models/wolf/*.glb assets/models/wolf/wolf-weights.json
```

## wolf.rig.glb

| Item | Value |
|---|---|
| Size | 731,916 bytes |
| SHA-256 | `d42c5793cd52c91b8ac800df8f2ffef2b1739879473c1437ed49aba54ac28f96` |
| Bind | The role-neutral bind (design 4.4): the arms of the source, straight (`studio.straightArms` of the config), with the elbow axes of a forward bend (`studio.bindArms`), and the bind paws supinated so that the largest paw twist of the roles of the cast matrix is smallest (`studio.bindSupination`) |
| Shapes | The arm-down shape of each arm, and the straight legs of each side |
