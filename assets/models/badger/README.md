# Badger model

This folder holds the source mesh of the badger, a copy with rebuilt arms and its weights, and the
rigged copy. The app does not serve these files. It loads the module `src/models/studio/badger.ts`,
which this chain writes:

```text
badger.glb                               source mesh
   │  tools/blender/badger_edit.py       arms free of the trunk
   v
badger-edit.glb                          `armSource` of tools/mesh-rigs/badger.json (git keeps it out)
   │  tools/blender/arm_rebuild.py       rebuilt arms and painted weights
   v
badger-arms.glb + badger-weights.json    `source` and `paintedWeights` of the config
   │  pnpm rig-mesh badger
   v
badger.rig.glb                           rigged mesh
   │  pnpm studio-body badger
   v
src/models/studio/badger.ts              studio body of the app
```

`docs/agents/rigging.md` gives the steps of the chain.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `badger.glb` | Source mesh (below) | None |
| `badger-edit.glb` | Copy of `badger.glb` with the arms free of the trunk. Git keeps out its 15 MB. License as `badger.glb` | `blender -b --factory-startup -P tools/blender/badger_edit.py -- assets/models/badger/badger-edit.glb` |
| `badger-arms.glb` | Copy of `badger-edit.glb` with rebuilt arms. License as `badger.glb` | `arm_rebuild.py badger` |
| `badger-weights.json` | Weights of the same Blender run. License as `badger.glb` | `arm_rebuild.py badger` |
| `badger.rig.glb` | Output of the rig. License as `badger.glb` | `pnpm rig-mesh badger` |

## badger-edit.glb

The inner side of each upper arm of the source joins the side of the trunk to about half of the
upper arm, so `arm_rebuild.py` finds the first closed loop around the upper arm only at half of
the upper arm. `tools/blender/badger_edit.py` splits each arm from the trunk along its crease with
the steps of `beaver_edit.py`, turns it 8° out, and closes the arm and the trunk with new faces.
It removes the flap face of the left armpit first. `arm_rebuild.py` then finds the shoulder line
at 0.1 of the upper arm. Two runs give the same bytes. The script prints the joints of the turned
arm, which are the arm joints of the config.

## badger.glb

| Item | Value |
|---|---|
| Size | 15,344,392 bytes |
| SHA-256 | `773703b679ce831d8011429243cdc007b9e2c71daad3d05c057d97d8e5c5c77d` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Khronos glTF Blender I/O v4.3.47 |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,129 triangles and 4,202 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |
| Material | One material `BakedMaterial`, double-sided, with a base color texture (10.6 MB) and a metallic-roughness texture (4.6 MB), each a PNG |

```bash
shasum -a 256 assets/models/badger/badger.glb
```

## Mesh facts

The values are in the units of the studio: 1 unit from the soles to the skull top, the soles at
y = 0, +z forward, and +x the left side of the animal. The mesh faces +z, with its left side at
+x. The weld is at 1e-5.

- The weld gives 1,567 vertices in one part. 2 edges are open and 1 edge has more than two faces,
  all at the flap face of the vertices 523, 524, and 496 in the left armpit. 131 faces have a
  corner angle below 10°.
- The box is x -0.301 to 0.301, y 0 to 1, and z -0.289 to 0.287. The badger is 1.9031 units of
  the file high from the soles to the skull top, which is the highest point.
- The badger stands upright on very short legs, with the crotch at y 0.12. The round body is
  widest at y 0.25 (x ±0.22). The short arms hang down, out, and forward. They join the trunk to
  about half of the upper arm, and they are apart from the body from x 0.16 out. The paws and the
  light claws are at y 0.31 to 0.40.
- The front of the body, the arms, and the legs have dark gray fur. The back and the tail have
  gray fur. The head is white, with a black stripe over each eye from the snout to the ear.
- The black nose is at the tip of the snout (z 0.287 at y 0.838). The black eyes are at y 0.89
  and z 0.16. A dark smile line is under the snout.
- The round ears with white rims stand at the sides of the top of the head, from y 0.90 to 0.98.
- The short tail sits low on the back, from y 0.10 to 0.155 and back to z -0.289.
