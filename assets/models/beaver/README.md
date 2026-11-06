# Beaver model

This folder holds the source mesh of the beaver, a copy with rebuilt arms and its weights, a copy
of that with no flap under the armpits, and the rigged copy. The app does not serve these files. It loads the module `src/models/studio/beaver.ts`,
which this chain writes:

```text
beaver.glb                               source mesh
   │  tools/blender/beaver_edit.py       arms free of the trunk
   v
beaver-edit.glb                          `armSource` of tools/mesh-rigs/beaver.json (git keeps it out)
   │  tools/blender/arm_rebuild.py       rebuilt arms and painted weights
   v
beaver-arms.glb + beaver-weights.json    `paintedWeights` of the config
   │  point edits in Blender             no flap under the armpits (beaver-arms-crease.json)
   v
beaver-arms-crease.glb                   `source` of the config
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
| `beaver-arms-crease.glb` | Copy of `beaver-arms.glb` with no flap under the armpits. License as `beaver.glb` | None: point edits in Blender (below) |
| `beaver-arms-crease.json` | The list of the edits of `beaver-arms-crease.glb`. License as `beaver.glb` | None |
| `beaver.rig.glb` | Output of the rig. License as `beaver.glb` | `pnpm rig-mesh beaver` |

## beaver-edit.glb

The upper arm of the source joins the side of the trunk from the shoulder down to the elbow, so
`arm_rebuild.py` finds no closed loop around it. `tools/blender/beaver_edit.py` splits each arm
from the trunk along its crease, turns it 10° out, and closes the arm and the trunk with new faces.
It removes the flap face of the left armpit first. The other faces stay as in `beaver.glb`. Two
runs give the same bytes. The script prints the joints of the turned arm 1.5 times longer, which
are the arm joints of the config.

## beaver-arms-crease.glb

| Item | Value |
|---|---|
| Size | 1,188,124 bytes |
| SHA-256 | `1375c9e678aa98b9447c16d978acf9b64ddaad44bb470dcab7f9aad666b6eeca` |
| Writer | Khronos glTF Blender I/O v5.2.40 |

`beaver_edit.py` closes the trunk under each freed arm with a wall. In `beaver-arms.glb` the top
row of that wall is a chain of vertices along the armpit, from the front of the shoulder to the
back, and it stands about 0.02 units above the next row of the wall. The wall and the underside of
the upper arm meet at the chain at an angle of 40° to 85°, so the strip of the wall between the
chain and the next row was a thin flap under each armpit. Seen edge-on, it showed as a dark sliver
between the upper arm and the trunk, and in the bind it stretched into a web of thin faces.

The copy removes each flap with point edits in the live Blender on the welded mesh. Each chain
vertex merges into its nearest neighbor of the next row of the wall, at the place of that
neighbor, so that no vertex goes to a new place: 7 merges on the right and 6 on the left.
`beaver-arms-crease.json` lists the 13 merges in their order. The two ends of each chain, at the
top of the shoulder and at the back of the armpit, stay. The underside of the arm now meets the
wall in a crease at the next row, with no notch. Each merge moves a corner at most 0.022 units.
The copy has 1,911 vertices and 3,808 triangles after the weld (1,924 and 3,834 before): 26
faces go, and each other face keeps the UVs of its own corners. Each merged corner takes the
weight row of its new vertex in `beaver-weights.json`.

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
