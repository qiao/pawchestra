# Dog model

This folder holds the source mesh of the dog, a copy with patched arms, and the rigged copy. The
app does not serve these files. It loads the module `src/models/studio/dog.ts`, which this chain
writes:

```text
dog.glb                           source mesh
   │  tools/blender/arm_patch.py  round patch on the inner side of each arm
   v
dog-patch.glb                     source of the rig (`source` of tools/mesh-rigs/dog.json)
   │  pnpm rig-mesh dog
   v
dog.rig.glb                       rigged mesh
   │  pnpm studio-body dog
   v
src/models/studio/dog.ts          studio body of the app
```

`docs/agents/rigging.md` gives the steps of the chain.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `dog.glb` | Source mesh (below) | None |
| `dog-patch.glb` | Copy of `dog.glb` with patched arms. License as `dog.glb` | `arm_patch.py` (below) |
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
it. No vertex of the source moves. The copy has 3,160 triangles. A run gives the same bytes:

```bash
blender -b --factory-startup --python tools/blender/arm_patch.py -- \
  tools/mesh-rigs/dog.json assets/models/dog/dog.glb assets/models/dog/dog-patch.glb \
  '{"step":0.02,"freeR":false,"fade":[0.05,0.35],"scale":1.0}'
```

```bash
shasum -a 256 assets/models/dog/dog.glb assets/models/dog/dog-patch.glb
```
