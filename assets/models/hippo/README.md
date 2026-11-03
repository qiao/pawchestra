# Hippo model

This folder holds the T-pose source mesh of the hippo, a copy with rebuilt arms and its weights,
and the rigged copy. The app does not serve these files. It loads the module
`src/models/studio/hippo.ts`, which this chain writes:

```text
hippo-tpose.glb                      source mesh (`armSource` of tools/mesh-rigs/hippo.json)
   │  tools/blender/arm_rebuild.py   rebuilt arms and painted weights
   v
hippo-arms.glb + hippo-weights.json  `source` and `paintedWeights` of tools/mesh-rigs/hippo.json
   │  pnpm rig-mesh hippo
   v
hippo.rig.glb                        rigged mesh
   │  pnpm studio-body hippo
   v
src/models/studio/hippo.ts           studio body of the app
```

`docs/agents/rigging.md` gives the steps of the chain.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `hippo-tpose.glb` | Source mesh (below) | None |
| `hippo-arms.glb` | Copy of `hippo-tpose.glb` with rebuilt arms. License as `hippo-tpose.glb` | `blender -b --factory-startup -P tools/blender/arm_rebuild.py -- hippo` |
| `hippo-weights.json` | Weights of the same Blender run. License as `hippo-tpose.glb` | The same run |
| `hippo.rig.glb` | Output of the rig. License as `hippo-tpose.glb` | `pnpm rig-mesh hippo` |

## hippo-tpose.glb

The source mesh of the hippo, in a T-pose: the arms are level and out to the sides, free of the
trunk. The mesh has no skeleton.

| Item | Value |
|---|---|
| Size | 16,620,776 bytes |
| SHA-256 | `8b9ed066f67a7c2a80bd18643275e62d5a82e2939c9589b81f47d3197905ddac` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Khronos glTF Blender I/O v4.3.47 |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,098 triangles and 4,255 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |
| Material | One material `BakedMaterial`, double-sided, with a base color PNG (10,781,869 bytes) and a metallic-roughness PNG (5,682,574 bytes), each of 4096 × 4096 pixels |

The values below are in the units of the studio: 1 unit from the soles to the top of the ears,
the soles at y = 0, +z forward, and +x the left side of the animal. The mesh faces +z. The weld is
at 1e-5.

- The weld gives 1,552 vertices in one connected part. Three open edges and one edge with three
  faces remain. 94 faces have a corner angle below 10°.
- The box is x -0.536 to 0.536, y 0 to 1, and z -0.270 to 0.268. The hippo is 1.7724 units of the
  file high from the soles to the top of the ears. The top of the skull is at y 0.984.
- The hippo stands upright on very short legs, with the crotch at y 0.14. The very round belly
  goes forward to z 0.214.
- The arms are level at y 0.63 and free of the trunk from x 0.2 out. Each paw ends at x 0.536,
  with a row of light claws under its end, so the palm faces down.
- The eyes are dark faces of the head surface at y 0.91 and z 0.104, with no shells. The small
  round ears go from y 0.96 to 1.0 at x ±0.08 to ±0.12. The short tail hangs from y 0.32 to 0.23
  at z -0.25.

## hippo-arms.glb and hippo-weights.json

`tools/blender/arm_rebuild.py` rebuilds the free T-pose arms of `hippo-tpose.glb` with quad tubes
at the length of the mesh (no `--factor`), and writes the Blender weights of the arms. The
shoulder line lies at 0.3 of the upper arm. Each arm has 9 rings of 16 vertices, and the elbow
helper is 0.0722 units, twice the gap of the elbow rings. The faces of the paws, the trunk, the
legs, and the head are the faces of the source. The rebuilt right wrist has a small dark recess
above the claws, so the rig gives its dark faces the fur color (`colors.border`). A run gives the
same bytes.

| File | Size | SHA-256 |
|---|---|---|
| `hippo-arms.glb` | 991,692 bytes | `cfb294e6abbb0f7b29afd2509f6c24c311d98de24b24ffcd4d39f942334f5784` |
| `hippo-weights.json` | 396,331 bytes | `7ae83f8ddd32fe6776a099c3a84fa4d385371753aad3c8a69d2d1c322970fe22` |

## hippo.rig.glb

| Item | Value |
|---|---|
| Size | 594,724 bytes |
| SHA-256 | `906c55b95319e0bdf62b6de1687563f2bea8a5288ad47f8a9b196b17a46e9e6e` |
| Bind | The role-neutral bind (design 4.4): the arms of the source, straight (`studio.straightArms`), with the elbow axes of the bent bind of `studio.bindArms`, and the bind supination L 20 and R 0 (`studio.bindSupination`) |
| Shapes | The arm-down shape of each arm and the straight legs of each side. No `raise` shape |

A run of `pnpm rig-mesh hippo` gives the same bytes.
