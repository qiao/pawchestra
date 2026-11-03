# Beaver model

This folder holds the source mesh of the beaver, a copy with rebuilt arms and its weights, and the
rigged copy. The app does not serve these files. It loads the module `src/models/studio/beaver.ts`,
which this chain writes:

```text
beaver.glb                               source mesh
   │  tools/blender/beaver_edit.py       arms free of the trunk
   v
beaver-edit.glb                          `armSource` of tools/mesh-rigs/beaver.json (git keeps it out)
   │  tools/blender/arm_rebuild.py       rebuilt arms and painted weights
   v
beaver-arms.glb + beaver-weights.json    `source` and `paintedWeights` of the config
   │  pnpm rig-mesh beaver
   v
beaver.rig.glb                           rigged mesh
   │  pnpm studio-body beaver
   v
src/models/studio/beaver.ts              studio body of the app
```

`docs/agents/rigging.md` gives the steps of the chain.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `beaver.glb` | Source mesh (below) | None |
| `beaver-edit.glb` | Copy of `beaver.glb` with the arms free of the trunk. Git keeps out its 17 MB. License as `beaver.glb` | `blender -b --factory-startup -P tools/blender/beaver_edit.py -- assets/models/beaver/beaver-edit.glb --factor 1.5` |
| `beaver-arms.glb` | Copy of `beaver-edit.glb` with rebuilt arms. License as `beaver.glb` | `arm_rebuild.py beaver --factor 1.5` |
| `beaver-weights.json` | Weights of the same Blender run. License as `beaver.glb` | `arm_rebuild.py beaver --factor 1.5` |
| `beaver.rig.glb` | Output of the rig. License as `beaver.glb` | `pnpm rig-mesh beaver` |

## beaver-edit.glb

The upper arm of the source joins the side of the trunk from the shoulder down to the elbow, so
`arm_rebuild.py` finds no closed loop around it. `tools/blender/beaver_edit.py` splits each arm
from the trunk along its crease, turns it 10° out, and closes the arm and the trunk with new faces.
It removes the flap face of the left armpit first. The other faces stay as in `beaver.glb`. Two
runs give the same bytes. The script prints the joints of the turned arm 1.5 times longer, which
are the arm joints of the config.

## beaver.glb

| Item | Value |
|---|---|
| Size | 17,716,184 bytes |
| SHA-256 | `8856d19acf8a54b7432c693fa07132e727aa87a2ab2d91e8ab2ec45bf6ee5cc5` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Khronos glTF Blender I/O v4.3.47 |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,119 triangles and 4,690 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |
| Material | One material `BakedMaterial`, double-sided, with a base color texture and a metallic-roughness texture, each a PNG |

```bash
shasum -a 256 assets/models/beaver/beaver.glb
```

## Mesh facts

The values are in the units of the studio: 1 unit from the soles to the skull top, the soles at
y = 0, +z forward, and +x the left side of the animal. The mesh faces +z, with its left side at
+x. The weld is at 1e-5.

- The weld gives 1,567 vertices in one part. 18 open edges and 8 edges with more than two faces
  lie in the whisker roots on the cheeks and in one small spot of the left armpit (the flap face
  of the vertices 484, 487, and 488). 325 faces have a corner angle below 10°.
- The box is x -0.316 to 0.313, y 0 to 1, and z -0.395 to 0.393. The beaver is 1.9028 units of
  the file high from the soles to the skull top, which is the highest point.
- The beaver stands upright on short legs, with the crotch at y 0.125 and long flat feet forward
  to z 0.286. The round belly goes forward to z 0.34.
- The short arms hang down, out, and forward. The upper arm joins the trunk down to the armpit at
  y 0.49, below the elbow joint at y 0.52. The forearms are apart from the body, with the paws at
  y 0.36 to 0.45.
- The fur is orange-brown, with a cream belly and muzzle, dark brown paws and feet, and a dark
  gray tail.
- The eyes are dark faces of the head surface at y 0.89 to 0.92 and z 0.27 to 0.29, with no
  shells. The nose is a dark pad at the front of the muzzle, and two white front teeth stand
  under it.
- The small round ears stand on the sides of the head, at y 0.89 to 0.95 and x ±0.11 to ±0.15.
- The broad flat tail goes from its root behind the buttock (y 0.135, z -0.09) back and down to
  the floor, to its tip at z -0.395. It is up to 0.124 out to each side of the middle plane.
