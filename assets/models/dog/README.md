# Dog model

This folder holds the source mesh of the dog, a copy with patched arms, a copy with rebuilt arms
and its weights, and the rigged copy. The app does not serve these files. It loads the module
`src/models/studio/dog.ts`, which this chain writes:

```text
dog.glb                               source mesh
   │  tools/blender/arm_patch.py      round patch on the inner side of each arm
   v
dog-patch.glb                         `armSource` of tools/mesh-rigs/dog.json
   │  tools/blender/arm_rebuild.py    rebuilt arms and painted weights
   v
dog-arms.glb + dog-weights.json       `source` and `paintedWeights` of tools/mesh-rigs/dog.json
   │  pnpm rig-mesh dog
   v
dog.rig.glb                           rigged mesh
   │  pnpm studio-body dog
   v
src/models/studio/dog.ts              studio body of the app
```

`docs/agents/rigging.md` gives the steps of the chain.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `dog.glb` | Source mesh (below) | None |
| `dog-patch.glb` | Copy of `dog.glb` with patched arms. License as `dog.glb` | `arm_patch.py` (below) |
| `dog-arms.glb` | Copy of `dog-patch.glb` with rebuilt arms. License as `dog.glb` | `arm_rebuild.py dog --factor 1.35` |
| `dog-weights.json` | Weights of the same Blender run. License as `dog.glb` | `arm_rebuild.py dog --factor 1.35` |
| `dog.rig.glb` | Output of the rig. License as `dog.glb` | `pnpm rig-mesh dog` |

## dog.glb

| Item | Value |
|---|---|
| Size | 16,259,152 bytes |
| SHA-256 | `24d8087c4a0929f6349f73a6dbbf63d080f5e97d3f4e2f66aebd01474eb9f1e6` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Khronos glTF Blender I/O v4.3.47 |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,139 triangles and 4,420 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |
| Material | One material `BakedMaterial`, double-sided, with a base color texture and a metallic-roughness texture, each a PNG of 4096 × 4096 pixels. The texture is an atlas of an automatic unwrap |

The values below are in the units of the studio: 1 unit from the soles to the top of the head,
the soles at y = 0, +z forward, and +x the left side of the animal. The mesh faces +z. The weld is
at 1e-5.

- The weld gives 1,574 vertices in one connected part. The mesh has 10 open edges and 5 edges
  with more than two faces. 139 faces have a corner angle below 10°.
- The box is x -0.280 to 0.280, y 0 to 1, and z -0.309 to 0.303. The dog is 1.903 units of the
  file high from the soles to the top of the head.
- The dog is a beagle that stands upright on its hind legs. Its arms hang down, out, and forward,
  with the paws in front of the belly at y 0.37 to 0.47.
- The eyes and the nose are dark faces of the head surface, with no shells. The long ears hang
  down beside the head to y 0.74. The tail tip is at z -0.31, 0.16 units above the floor.

## dog-patch.glb

| Item | Value |
|---|---|
| Size | 16,232,556 bytes |
| SHA-256 | `8a2b4cad31d94ce4372b02c36af2e1a6d9a1d6ccc592f60ec3dec8696fd8de2d` |
| Writer | Khronos glTF Blender I/O of Blender 5.2.2, from an import of `dog.glb` |

Each arm of the source joins the side of the trunk from the shoulder down to 0.80 of the upper
arm. The edit removes the faces that join each arm to the trunk below the cut top of the rig (22
on the left, 19 on the right). It closes the inner side of each arm with a round patch of 13 and 9
new vertices (36 and 26 faces). The hole of the trunk stays open, and the cut of the rig closes
it. No vertex of the source moves. The copy has 3,160 triangles. The script reads the joints of
the config, and the config of the rebuilt arms has the joints of the longer arms. So a run with the
config of commit `46ab1d72`, the last config with the joints of the source, gives the same bytes:

```bash
git show 46ab1d72:tools/mesh-rigs/dog.json > /tmp/dog-patch.json
blender -b --factory-startup --python tools/blender/arm_patch.py -- \
  /tmp/dog-patch.json assets/models/dog/dog.glb assets/models/dog/dog-patch.glb \
  '{"step":0.02,"freeR":false,"fade":[0.05,0.35],"scale":1.0}'
```

```bash
shasum -a 256 assets/models/dog/dog.glb assets/models/dog/dog-patch.glb
```

## dog-arms.glb and dog-weights.json

| Item | Value |
|---|---|
| `dog-arms.glb` | 1,123,888 bytes, SHA-256 `5b9f1c7f07d25c0188e5c0fda017e41a2787ec77d63ec03e2af28cc9cccd91a3` |
| Mesh | 1,893 vertices after a weld at 1e-5, 3,756 triangles: on each arm a tube of 10 quad rings of 16 vertices from 0.35 of the upper arm to 0.1 of the paw, joined to the trunk and the paw with Bridge Edge Loops, with Beautify Faces, Collapse Edges on the bridge triangles, and no flap face at the loops |
| Material | One material with one base color JPEG: the atlas of the source, and a strip of 512 pixels on top with the fur color of the source arms, baked onto the new faces. No metallic-roughness texture |
| `dog-weights.json` | 425,610 bytes, SHA-256 `7228f27e2d46ce05f83d5bb0553a5400a6506f88e0c94fdd3dec941f7a375aab` |
| Weights | The automatic weights of Blender with the weight rules of the script, on the studio bones and the arm segments and helpers (`armSegments` of the config), for `paintedWeights` of the config |

`tools/blender/arm_rebuild.py` puts new quad faces on each arm of `dog-patch.glb` from the shoulder
line to the wrist, with the settings that it finds from the joints of the config and from rays
through the mesh. The new arm surface lies on the old one. The arms are 1.35 times longer from the
shoulder line (`--factor 1.35`), because a rig with arm segments does not stretch the arms. The
round inner sides of the arms above the shoulder line, the paws, the trunk with its two holes, the
legs, the tail, and the head are the faces of `dog-patch.glb`. The cut of the rig closes the holes
of the trunk. A run gives the same bytes:

```bash
blender -b --factory-startup -P tools/blender/arm_rebuild.py -- dog --factor 1.35
shasum -a 256 assets/models/dog/dog-arms.glb assets/models/dog/dog-weights.json
```

## dog.rig.glb

`pnpm rig-mesh dog` rigs `dog-arms.glb` with the role-neutral bind of design 4.4: straight bind
arms, the bind supination of `studio.bindSupination`, and three `raise` shapes of the inner elbows
(`tools/mesh-rigs/dog.json`). `pnpm studio-body dog` then writes `src/models/studio/dog.ts`.
