# Deer model

This folder holds the source mesh of the deer, a copy with rebuilt arms and its weights, and the
rigged copy. The app does not serve these files. It loads the module `src/models/studio/deer.ts`,
which this chain writes:

```text
deer.glb                           source mesh
   │  tools/blender/deer_arms.py   rebuilt arms and painted weights
   v
deer-arms.glb + deer-weights.json  `source` and `paintedWeights` of tools/mesh-rigs/deer.json
   │  pnpm rig-mesh deer
   v
deer.rig.glb                       rigged mesh
   │  pnpm studio-body deer
   v
src/models/studio/deer.ts          studio body of the app
```

`docs/agents/rigging.md` gives the steps of the chain.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `deer.glb` | Source mesh (below) | None |
| `deer-arms.glb` | Copy of `deer.glb` with rebuilt arms. License as `deer.glb` | `deer_arms.py` |
| `deer-weights.json` | Weights of the same Blender run. License as `deer.glb` | `deer_arms.py` |
| `deer.rig.glb` | Output of the rig. License as `deer.glb` | `pnpm rig-mesh deer` |

## deer.glb

| Item | Value |
|---|---|
| Size | 16,557,936 bytes |
| SHA-256 | `1066a9f8f0a66cbe8926d67d2abaa09217e2f7872bbe970cc3cf5328491c396a` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Khronos glTF Blender I/O v4.3.47 |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,140 triangles and 4,717 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |
| Material | One material `BakedMaterial`, double-sided, with a base color texture (10.6 MB) and a metallic-roughness texture (5.8 MB), each a PNG |

The values below are in the units of the studio: 1 unit from the soles to the highest point, the
soles at y = 0, +z forward, and +x the left side of the animal. The mesh faces +z. The weld is at
1e-5.

- The weld gives 1,573 vertices in one part. 4 edges are open and 2 edges have more than two
  faces. 227 faces have a corner angle below 10°.
- The box is x -0.196 to 0.196, y 0 to 1, and z -0.173 to 0.173. The deer is 1.9024 units of the
  file high from the soles to the tips of the antlers. The skull top between the antlers is at
  y 0.852.
- The deer stands upright on short legs with dark hooves, with the crotch at y 0.245. The short
  arms hang down beside the body, apart from it below y 0.49, with dark hooves for hands down to
  y 0.285.
- The small dark nose is at z 0.173 and y 0.722. The puff tail is at y 0.29 to 0.41. The large
  ears stand out at x 0.12 to 0.19, and two antlers rise from the top of the head to y 1.

## deer-arms.glb and deer-weights.json

| Item | Value |
|---|---|
| `deer-arms.glb` | 1,003,056 bytes, SHA-256 `9e358b89a4fef024aee6d8b6a5d6489fbde450f5994e3b1de7318a48aed038e5` |
| `deer-weights.json` | 457,068 bytes, SHA-256 `d1bd654e29d2a01b3f922ba69677f434b64f8da481ab0fbc0cc07cc3d650e874` |
| Writer | Khronos glTF Blender I/O v5.2.40, from an import of `deer.glb` |

Each upper arm of the source joins the side of the trunk down to near the elbow. The script cuts
each arm along the seam where it meets the trunk and under a cap plane at the shoulder. It fills a
side wall of the trunk under the arm. It replaces the faces of the arm from the socket to the
wrist with a quad tube that has a flat inner side on the wall. The arms are 1.25 times longer than
the arms of the source. The faces of the paws, the trunk, the legs, and the head are the faces of
the source. The arm image lies in a strip on top of the atlas, a JPEG at the quality 92. The copy
has 4,152 triangles. A run gives the same bytes:

```bash
blender -b --factory-startup -P tools/blender/deer_arms.py
shasum -a 256 assets/models/deer/*.glb assets/models/deer/deer-weights.json
```

## deer.rig.glb

| Item | Value |
|---|---|
| Size | 596,992 bytes |
| SHA-256 | `f614c227eab44495a0cabc3cc3c9a1ac9a7e0c3d50729af3a0786960cdf7d228` |
| Bind | The role-neutral bind (design 4.4): the arms of the source, straight (`studio.straightArms` of the config), with the elbow axes of the old bent bind (`studio.bindArms`), and the bind paws supinated so that the largest paw twist of the roles of the cast matrix and the harp is smallest (`studio.bindSupination`) |
| Shapes | The arm-down shape of each arm, the straight legs of each side, and a `raise` shape of the bent right elbow of the harp hold |

A run of `pnpm rig-mesh deer` gives the same bytes.
