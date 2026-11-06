# Badger model

This folder holds the source mesh of the badger, a copy with rebuilt arms and its weights, a copy
with fewer folds at the arm roots, and the rigged copy. The app does not serve these files. It loads the module `src/models/studio/badger.ts`,
which this chain writes:

```text
badger.glb                               source mesh
   │  tools/blender/badger_edit.py       arms free of the trunk
   v
badger-edit.glb                          `armSource` of tools/mesh-rigs/badger.json (git keeps it out)
   │  tools/blender/arm_rebuild.py       rebuilt arms and painted weights
   v
badger-arms.glb + badger-weights.json    `paintedWeights` of the config
   │  point edits in Blender             fewer folds at the arm roots (badger-arms-pit.json)
   v
badger-arms-pit.glb                      `source` of the config
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
| `badger-arms-pit.glb` | Copy of `badger-arms.glb` with fewer folds at the arm roots. License as `badger.glb` | None: point edits in Blender (below) |
| `badger-arms-pit.json` | The list of the edits of `badger-arms-pit.glb`. License as `badger.glb` | None |
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

## badger-arms-pit.glb

| Item | Value |
|---|---|
| Size | 990,912 bytes |
| SHA-256 | `716f32642c35ab94165063e2a2cc03300b9c37a379194d56f06dc0ec30c6c3c6` |
| Writer | Khronos glTF Blender I/O v5.2.40 |

Where the rebuilt tube of `badger-arms.glb` meets the closed trunk side of `badger_edit.py`, these
faults showed:

- On the left, a V notch at the top front of the armpit in the bind, about 3 cm: an arm corner
  1.6 cm from a trunk corner left a deep slot between them, also at the top front of the root at a
  crash of the cymbals.
- Along the seam under each root, slivers of about 1.5 cm between corners of other weights folded
  over into fins and deep notches in the bind and in each moment of the cymbalist.

The copy removes them with 10 point edits in the live Blender on the welded mesh: 7 on the left
and 3 on the right. Each edit merges one vertex into a neighbor vertex at the place of that
neighbor, so that no vertex goes to a new place. The left arm corner of the V notch merges into
the trunk corner beside it, so that the arm meets the trunk in a crease. `badger-arms-pit.json`
lists the merges in their order. Each merge moves a corner at most 0.020 units, and two merges in
a row move one corner 0.028 units. The copy has 1,859 vertices and 3,714 triangles after the weld
(1,869 and 3,734 before): 20 faces go, and each other face keeps the UVs of its own corners. Each
merged corner takes the weight row of its new vertex in `badger-weights.json`.

Each merge keeps each edge on two faces. A merge of a seam vertex on the back of the left root
put three faces on one edge and opened a hole, so the copy does not keep it. A row of folded
slivers along the right front seam stays: a merge along the row collapses the
whole row, and a merge across it does not remove the folds.

## badger.rig.glb

The rig has four `raise` shapes (`raise` of `tools/mesh-rigs/badger.json`): the left arm that
holds the triangle up, and three arms of the recast roles of the cast matrix. The shared flute and
clarinet holds turn the left upper arm about 118° from the bind, and the flute hold the right
upper arm about 112°, while the clavicle turns only 23° to 37°. The linear blend then crushes the
front and the top of the arm root, and its faces fold. Each shape relaxes these faces in the pose
of its hold (`pnpm raise-fit`). The clarinet shape also holds the trumpet hold, and the right
flute shape the right arm of the trumpet hold. A shape of the cello hold (101°) also gave the
percussionist 4 more folded faces, so the cello has no shape.
