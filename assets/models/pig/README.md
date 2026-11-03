# Pig model

This folder holds the source mesh of the pig, a copy with new upper arms, a copy with rebuilt arms
and its weights, and the rigged copy. The app does not serve these files. It loads the module
`src/models/studio/pig.ts`, which this chain writes:

```text
pig.glb                           source mesh
   │  tools/blender/pig_arms.py   new upper arms
   v
pig-upper.glb                     `armSource` of tools/mesh-rigs/pig.json
   │  tools/blender/arm_rebuild.py rebuilt arms and painted weights
   v
pig-arms.glb + pig-weights.json   `source` and `paintedWeights` of tools/mesh-rigs/pig.json
   │  pnpm rig-mesh pig
   v
pig.rig.glb                       rigged mesh
   │  pnpm studio-body pig
   v
src/models/studio/pig.ts          studio body of the app
```

`docs/agents/rigging.md` gives the steps of the chain.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `pig.glb` | Source mesh (below) | None |
| `pig-upper.glb` | Copy of `pig.glb` with new upper arms. License as `pig.glb` | `pig_arms.py` (below) |
| `pig-arms.glb` | `pig-upper.glb` with rebuilt arms 1.5 times as long. License as `pig.glb` | `blender -b --factory-startup -P tools/blender/arm_rebuild.py -- pig --factor 1.5` |
| `pig-weights.json` | Weights of the same Blender run. License as `pig.glb` | The same run |
| `pig.rig.glb` | Output of the rig. License as `pig.glb` | `pnpm rig-mesh pig` |

## pig.glb

| Item | Value |
|---|---|
| Size | 16,013,332 bytes |
| SHA-256 | `29f481d42e3f4ac0f188449dca42d49302b724e2c28271bd6cbc27bcd11cf1ae` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Khronos glTF Blender I/O v4.3.47 |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,118 triangles and 4,226 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |
| Material | One material `BakedMaterial`, double-sided, with a base color texture and a metallic-roughness texture, each a PNG |

The values below are in the units of the studio: 1 unit from the soles to the tips of the ears,
the soles at y = 0, +z forward, and +x the left side of the animal. The mesh faces +z. The weld is
at 1e-5.

- The weld gives 1,559 vertices in one closed part, with no open edge and no edge with more than
  two faces. 230 faces have a corner angle below 10°.
- The box is x -0.300 to 0.298, y 0 to 1, and z -0.256 to 0.255. The pig is 1.9027 units of the
  file high from the soles to the tips of the ears. The top of the skull is at y 0.948.
- The pig stands upright on short legs, with the crotch at y 0.145 and dark hooves. The round
  belly goes forward to z 0.246.
- The short arms hang down, out, and forward. They are apart from the body from x 0.17 out, with
  the dark hooves at y 0.35 to 0.40.
- The pink snout disc is at the front of the head (z 0.255 at y 0.79). The eyes are dark faces of
  the head surface at y 0.83 to 0.86 and z 0.12 to 0.15, with no shells.
- The ears go from y 0.87 to 1.0 at x ±0.08 to ±0.23, with the tips folded forward. The small
  curled tail is at y 0.26 to 0.33 and z -0.19 to -0.26.

## pig-upper.glb

| Item | Value |
|---|---|
| Size | 16,002,492 bytes |
| SHA-256 | `6ab329a042084d08ab779d14aae359dc41e1e02512dfb80a95a255f7075942be` |
| Writer | Khronos glTF Blender I/O of Blender 5.2.2, from an import of `pig.glb` |
| Contents | One mesh of 3,162 triangles in one closed part, with the texture of `pig.glb` |

The source has no upper arm of its own. Above the elbow, the arm is a bulge of the trunk wall, and
the arm is a separate loop only from the elbow down. For each side, the script does these steps:

1. It cuts the arm at a plane just below the elbow.
2. It removes the 93 to 95 faces of the bulge and fills the wall with a fan.
3. It builds a round tube of two rings of 10 edges from the loop of the cut to a closed dome around
   the shoulder joint.
4. It moves the middle of the fan, the rim of the hole, and two rings of the trunk around the rim
   toward the mean of their neighbors, in 12 rounds. Thus the wall is smooth, with no star of
   spikes at the top of the shoulder.

The dome of the right tube stands 1.2 times its radius above the shoulder joint (0.6 on the left),
so that no gap shows between the top of the tube and the wall at the back. The tube and the
forearm have no face that joins them to the trunk. The tube takes the fur color of the forearm.

The script runs in the live Blender or in a batch run:

```bash
blender -b --python tools/blender/pig_arms.py -- assets/models/pig/pig.glb assets/models/pig/pig-upper.glb
shasum -a 256 assets/models/pig/*.glb
```

## pig-arms.glb and pig-weights.json

`tools/blender/arm_rebuild.py` rebuilds the arms of `pig-upper.glb` with quad tubes, 1.5 times as
long as the mesh (`--factor 1.5`), and writes the Blender weights of the arms. The shoulder line
lies at 0.55 of the upper arm. Each arm has 9 rings of 16 vertices, with 1 ring on the upper arm
and 3 on the forearm between the joint rings. A run gives the same bytes. With the bone pose of the
old horn hold, the round left forearm goes 2.7 cm into the belly (1.2 cm on the old arm), so the
horn hold keeps the left elbow away from the belly (design 5.3).

| File | Size | SHA-256 |
|---|---|---|
| `pig-arms.glb` | 965,548 bytes | `13450e613415d8bbcf3e2c4eaa9c9584019b7b2967f0a147fd44808758ebf4f6` |
| `pig-weights.json` | 410,080 bytes | `9bea1248d22906b422644507a73a0426fd3742b7afe4d372b803ab19173f7f75` |
